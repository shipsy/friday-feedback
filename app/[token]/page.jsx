import Questionnaire from './Questionnaire';
import { verifyToken } from '@/lib/token';

function normalizeRating(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'yes' || v === 'no' ? v : '';
}

// Server shell: verify the signed token, derive the ticket from it, and hand off
// to the client form. A bare or tampered token renders the invalid state and
// nothing else — no form, no POST target, no ticket echoed back.
export default async function TokenPage({ params, searchParams }) {
  const { token } = await params;
  const sp = (await searchParams) || {};

  const ticket = verifyToken(token);
  if (!ticket) {
    return (
      <section className="card" aria-labelledby="invalid-heading">
        <h1 id="invalid-heading">This link is invalid</h1>
        <p className="muted">
          This link has expired or is invalid. Please use the feedback link from
          your support email.
        </p>
      </section>
    );
  }

  return (
    <Questionnaire
      token={token}
      ticket={ticket}
      arrivalRating={normalizeRating(sp.r)}
      customer={typeof sp.c === 'string' ? sp.c : ''}
    />
  );
}
