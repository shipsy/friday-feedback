import { google } from 'googleapis';

// Column order for the destination sheet (HLD §8).
const HEADER_ROW = [
  'ticket',
  'rating',
  'comment',
  'submitted_at',
  'customer',
  'user_agent',
];

// Neutralize leading spreadsheet formula triggers (= + - @ tab) so an exported
// CSV or a Looker Studio re-import can't execute user text as a live formula
// (CSV injection). RAW input already keeps the live sheet inert; this protects
// downstream re-import. Applied to free-text fields only — NOT the ticket, which
// is the upsert match key and is already constrained to [A-Za-z0-9-] by the API.
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
    // Reset so the next request retries.
    sheetsClientPromise.catch(() => {
      sheetsClientPromise = undefined;
    });
  }
  return sheetsClientPromise;
}

function tab() {
  return process.env.SHEET_TAB || 'Feedback';
}

function spreadsheetId() {
  const id = process.env.SHEET_ID;
  if (!id) throw new Error('SHEET_ID is not set');
  return id;
}

// Write the header row once if the target tab is empty.
async function ensureHeader(sheets) {
  const range = `${tab()}!A1:F1`;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range,
  });
  const existing = data.values && data.values[0];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER_ROW] },
    });
  }
}

// Upsert one CSAT row keyed by ticket (column A): update the matching row if it
// exists, else append. One CSAT per ticket (HLD §8 "Preferred").
export async function upsertFeedback({
  ticket,
  rating,
  comment,
  customer,
  userAgent,
  submittedAt,
}) {
  const sheets = await getSheetsClient();
  await ensureHeader(sheets);

  const row = [
    ticket,
    rating,
    neutralizeFormula(comment || ''),
    submittedAt,
    neutralizeFormula(customer || ''),
    neutralizeFormula(userAgent || ''),
  ];

  // Read column A to locate an existing row for this ticket (row 1 = header).
  // Note: this read-then-write upsert is not atomic (the Sheets values API has
  // no compare-and-set). Two truly simultaneous submits for the same *new*
  // ticket can both append, yielding duplicate rows. Accepted for this scope —
  // the client disables the button while submitting, and the HLD's analysis
  // model is "latest wins" (dedupe by submitted_at downstream). If strict
  // one-row-per-ticket is ever required, add a short per-ticket lock (e.g. Redis).
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: `${tab()}!A:A`,
  });
  const colA = data.values || [];

  let targetRow = -1;
  for (let i = 1; i < colA.length; i += 1) {
    if (colA[i] && colA[i][0] === ticket) {
      targetRow = i + 1; // 1-based sheet row number
      break;
    }
  }

  if (targetRow > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId(),
      range: `${tab()}!A${targetRow}:F${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
    return { action: 'updated', row: targetRow };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: `${tab()}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return { action: 'appended' };
}
