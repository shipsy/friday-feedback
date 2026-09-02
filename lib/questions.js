// The feedback questions, and everything derived from them: what the form
// renders, what the API accepts, and the sheet's column headers.
//
// Question set and the evidence behind every option:
//   docs/sdd/friday_feedback_signed_links_hld.md §7.3
//   docs/sdd/friday_fr_failure_taxonomy.md
//
// RULES: ids are append-only, never reused, never reordered — the array's order
// is the sheet's column order, so inserting one shifts every later column
// against the rows already written. Changing a question's *meaning* needs a new
// id, not an edited label.

export const QUESTIONS = [
  {
    id: 'cust_problem',
    type: 'multi',
    max: 3,
    showWhen: 'no',
    label: 'What was wrong with it?',
    options: [
      { value: 'asked_what_i_sent', label: "It asked for details we'd already sent" },
      { value: 'already_tried', label: "It suggested things we'd already tried" },
      { value: 'cant_do_it', label: "We couldn't find or do what it suggested" },
      { value: 'didnt_match', label: "It doesn't match what we're seeing in the system" },
      { value: 'pushed_back', label: 'It pushed this back to us or another team' },
      { value: 'no_fix', label: 'It explained the problem but nothing got fixed' },
    ],
  },
  {
    id: 'outcome',
    type: 'single',
    showWhen: 'no',
    label: 'Did you get what you needed in the end?',
    options: [
      { value: 'self', label: 'Yes — we worked it out ourselves' },
      { value: 'human', label: 'Yes — after a person stepped in' },
      { value: 'open', label: 'No — still not sorted' },
    ],
  },
  {
    id: 'cust_needed',
    type: 'text',
    maxLength: 1000,
    // Ungated: offered whatever the rating, so a happy customer can still say
    // something. The prompt sharpens once we know the response missed.
    label: 'Comment',
    labelNo: 'In one line — what did you need us to do?',
    placeholder: 'Tell us more (optional)',
  },
];

// Questions to render for a rating ('yes' | 'no' | '').
//
// `showWhen` gates a question to one rating; a question without it always shows.
// The rating is the ?r= value on an arrival link, or the in-page selection on a
// bare link — same primitive either way, which is why the reason questions
// appear the moment someone picks No on the classic form.
export function questionsFor(rating) {
  return QUESTIONS.filter((q) => !q.showWhen || q.showWhen === rating);
}

// The label to show for a question at a given rating.
export function labelFor(q, rating) {
  return rating === 'no' && q.labelNo ? q.labelNo : q.label;
}

// Strip ASCII control characters (C0 plus DEL), keeping tab/newline/CR so
// multi-line free text stays readable.
function stripControls(value) {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f;
    const isKeptWs = code === 0x09 || code === 0x0a || code === 0x0d;
    if (isControl && !isKeptWs) continue;
    out += ch;
  }
  return out;
}

// Answers -> { [id]: string }, one sheet cell per question. Unknown keys and
// unknown option values are dropped silently: a schema change while a customer
// has the page open must not 400 a real submission.
//
// An id ABSENT from the payload means "leave that cell alone". An id present
// with an empty string is a real answer that clears it. That distinction is what
// lets the rating write and the answers write land independently.
export function sanitizeAnswers(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const q of QUESTIONS) {
    if (!(q.id in input)) continue;
    const raw = input[q.id];

    if (q.type === 'text') {
      if (typeof raw !== 'string') continue;
      out[q.id] = stripControls(raw).slice(0, q.maxLength ?? 1000).trim();
      continue;
    }

    const allowed = q.options.map((o) => o.value);
    if (q.type === 'single') {
      if (typeof raw !== 'string' || !allowed.includes(raw)) continue;
      out[q.id] = raw;
      continue;
    }
    if (q.type === 'multi') {
      if (!Array.isArray(raw)) continue;
      const kept = new Set(raw.filter((v) => typeof v === 'string' && allowed.includes(v)));
      // Schema order, not tap order — so the cell is always spelled the same
      // way and groups cleanly in a pivot.
      out[q.id] = allowed.filter((v) => kept.has(v)).slice(0, q.max ?? 4).join(',');
    }
  }
  return out;
}

// 0-based column index -> A1 letter. 0->A, 25->Z, 26->AA. The AA+ case is not
// decoration: past 20 questions a naive fromCharCode(65 + i) emits punctuation
// and every range silently breaks.
export function colLetter(index) {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export const PREFIX = ['ticket', 'rating', 'submitted_at', 'updated_at', 'customer', 'user_agent'];
export const HEADER_ROW = [...PREFIX, ...QUESTIONS.map((q) => q.id)];
export const LAST_COL = colLetter(HEADER_ROW.length - 1);

// A1 range on a named tab, with the tab name quoted so spaces and apostrophes
// work. Unquoted interpolation breaks on any tab name containing a space.
export function range(tab, a1) {
  return `'${String(tab).replace(/'/g, "''")}'!${a1}`;
}
