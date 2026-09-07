import { NextResponse } from 'next/server';
import { upsertFeedback } from '@/lib/sheets';
import { sanitizeAnswers } from '@/lib/questions';
import { verifyToken } from '@/lib/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATINGS = new Set(['yes', 'no']);

// Strip ASCII control characters (C0 range plus DEL).
function sanitizeShort(value, max) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) continue;
    out += ch;
  }
  return out.slice(0, max).trim();
}

function bad(error) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

// Two independent kinds of write against the same row, in either order:
//   { token, rating }  — the yes/no signal, sent on arrival from ?r=, or by any
//                        machine caller holding a minted token.
//   { token, answers } — the questionnaire, sent when the customer submits.
//
// Order of operations matters: everything before the Sheets call is pure CPU, so
// forged traffic never reaches Google.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad('invalid_json');
  }
  body = body || {};

  // Honeypot: bots fill this. Silently accept (200) without writing anything.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true });
  }

  // The ticket comes ONLY from a verified MAC. A `ticket` field in the request
  // body is ignored — never read, never validated.
  const ticket = verifyToken(body.token);
  if (!ticket) return bad('invalid_link');

  const hasRating = 'rating' in body;
  const hasAnswers = 'answers' in body;
  if (!hasRating && !hasAnswers) return bad('empty_payload');

  let rating = '';
  if (hasRating) {
    rating = typeof body.rating === 'string' ? body.rating.trim().toLowerCase() : '';
    if (!RATINGS.has(rating)) return bad('invalid_rating');
  }

  const answers = hasAnswers ? sanitizeAnswers(body.answers) : {};
  const customer = sanitizeShort(body.customer, 120);

  try {
    await upsertFeedback({
      ticket,
      rating, // '' when absent — leaves column B untouched
      answers,
      customer,
      userAgent: request.headers.get('user-agent') || '',
      now: new Date().toISOString(),
    });
  } catch (err) {
    console.error('feedback write failed:', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
