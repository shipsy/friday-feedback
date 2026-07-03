import { NextResponse } from 'next/server';
import { upsertFeedback } from '@/lib/sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TICKET_RE = /^[A-Za-z0-9\-]{3,40}$/;
const MAX_COMMENT = 1000;

// Strip ASCII control characters (C0 range 0x00–0x1F plus DEL 0x7F).
// When keepWhitespace is true, tab/newline/carriage-return are preserved so
// multi-line comments stay readable.
function stripControls(value, keepWhitespace) {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f;
    const isWs = code === 0x09 || code === 0x0a || code === 0x0d;
    if (isControl && !(keepWhitespace && isWs)) continue;
    out += ch;
  }
  return out;
}

function sanitizeComment(value) {
  if (typeof value !== 'string') return '';
  return stripControls(value, true).slice(0, MAX_COMMENT).trim();
}

function sanitizeShort(value, max) {
  if (typeof value !== 'string') return '';
  return stripControls(value, false).slice(0, max).trim();
}

function bad(error) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('invalid_json');
  }

  const { ticket, rating, comment, customer, website } = body || {};

  // Honeypot: bots fill this. Silently accept (200) without writing anything.
  if (typeof website === 'string' && website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  if (typeof ticket !== 'string' || !TICKET_RE.test(ticket)) {
    return bad('invalid_ticket');
  }

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return bad('invalid_rating');
  }

  const cleanComment = sanitizeComment(comment);
  const cleanCustomer = sanitizeShort(customer, 120);

  try {
    await upsertFeedback({
      ticket,
      rating: ratingNum,
      comment: cleanComment,
      customer: cleanCustomer,
      userAgent: request.headers.get('user-agent') || '',
      submittedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('feedback write failed:', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
