import { google } from 'googleapis';
import {
  HEADER_ROW,
  LAST_COL,
  PREFIX,
  QUESTIONS,
  range,
} from './questions.js';

// Neutralize leading spreadsheet formula triggers (= + - @ tab) so an exported
// CSV or a Looker Studio re-import can't execute user text as a live formula
// (CSV injection). RAW input already keeps the live sheet inert; this protects
// downstream re-import. Applied to free text and generated cells only — NOT the
// ticket, which is the upsert match key and is already constrained to [A-Z0-9-].
function neutralizeFormula(value) {
  if (typeof value !== 'string' || value === '') return value;
  const c = value.charCodeAt(0);
  const isTrigger =
    c === 0x3d || c === 0x2b || c === 0x2d || c === 0x40 || c === 0x09;
  return isTrigger ? `'${value}` : value;
}

// Decode the service-account key from either raw JSON or base64-encoded JSON.
function loadServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set');
  }
  const text = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');
  const key = JSON.parse(text);
  // Some hosts store the key single-line with escaped newlines; restore them.
  if (typeof key.private_key === 'string') {
    key.private_key = key.private_key.replace(/\\n/g, '\n');
  }
  return key;
}

let sheetsClientPromise;

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const credentials = loadServiceAccount();
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const client = await auth.getClient();
      return google.sheets({ version: 'v4', auth: client });
    })();
    // Never cache a rejected init: a transient auth/network failure would
    // otherwise wedge this warm serverless instance into permanent 500s.
    sheetsClientPromise.catch(() => {
      sheetsClientPromise = undefined;
    });
  }
  return sheetsClientPromise;
}

function tab() {
  return process.env.SHEET_TAB || 'FR_Feedback';
}

function spreadsheetId() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('SHEET_ID is not set');
  return id;
}

// Create the target tab if it doesn't exist yet. Without this, a missing tab
// surfaces as an opaque 400 from values.get on the first submission.
async function ensureTab(sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetId(),
    fields: 'sheets.properties.title',
  });
  const titles = (meta.data.sheets || []).map((s) => s.properties.title);
  if (titles.includes(tab())) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      requests: [{ addSheet: { properties: { title: tab() } } }],
    },
  });
  return true;
}

// Write the header row when it's missing or narrower than the schema, so the tab
// self-heals as questions are appended.
async function ensureHeader(sheets) {
  const headerRange = range(tab(), `A1:${LAST_COL}1`);
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: headerRange,
  });
  const existing = (data.values && data.values[0]) || [];
  if (existing.length < HEADER_ROW.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: headerRange,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

// Field-level merge: only the fields present in this write overwrite the row.
// The rating and the answers arrive from two independent writes, so a full
// overwrite would mean the questionnaire submit blanks the rating recorded
// thirty seconds earlier — or a rating POST wipes the answers.
export function mergeRow({ existing, ticket, rating, answers, customer, userAgent, now }) {
  const row = [...(existing || [])];
  // Pad rows written under an older, narrower schema.
  while (row.length < HEADER_ROW.length) row.push('');
  row[0] = ticket;
  if (rating) row[1] = rating;
  row[2] = row[2] || now; // submitted_at: set once, on creation
  row[3] = now; // updated_at: every write
  if (customer) row[4] = neutralizeFormula(customer);
  if (userAgent) row[5] = neutralizeFormula(userAgent);
  QUESTIONS.forEach((q, i) => {
    if (q.id in answers) row[PREFIX.length + i] = neutralizeFormula(answers[q.id]);
  });
  return row;
}

// Upsert one row per ticket, keyed on column A.
//
// The read-then-write is not atomic (the Sheets values API has no
// compare-and-set) and there are two writers. A rating POST and an answers POST
// landing in the same instant can each merge onto the same pre-read row, and the
// later write drops the earlier one's field. In practice they're seconds apart —
// tap, page load, fill, submit.
// ponytail: accepted ceiling; short per-ticket lock (e.g. Redis) if it ever bites.
export async function upsertFeedback({
  ticket,
  rating,
  answers,
  customer,
  userAgent,
  now,
}) {
  const sheets = await getSheetsClient();
  await ensureTab(sheets);
  await ensureHeader(sheets);

  // Read the full width, not just column A: the scan already costs one request,
  // and the whole row is what makes the merge free.
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: range(tab(), `A:${LAST_COL}`),
  });
  const rows = data.values || [];

  let targetRow = -1;
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i] && rows[i][0] === ticket) {
      targetRow = i + 1; // 1-based sheet row
      break;
    }
  }

  const row = mergeRow({
    existing: targetRow > 0 ? rows[targetRow - 1] : undefined,
    ticket,
    rating,
    answers: answers || {},
    customer,
    userAgent,
    now,
  });

  if (targetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: range(tab(), `A${targetRow}:${LAST_COL}${targetRow}`),
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
    return { action: 'updated', row: targetRow };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: range(tab(), `A:${LAST_COL}`),
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return { action: 'appended' };
}
