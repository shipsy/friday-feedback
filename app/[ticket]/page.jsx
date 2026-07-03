import FeedbackForm from './FeedbackForm';

const TICKET_RE = /^[A-Za-z0-9\-]{3,40}$/;

function clampRating(value) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
  return 0;
}

// Server shell: validate the ticket, read the rating (?r=) and customer (?c=)
// prefills, and hand off to the client form. No lookup against DevRev (HLD §5).
export default async function TicketPage({ params, searchParams }) {
  const { ticket } = await params;
  const sp = (await searchParams) || {};

  if (typeof ticket !== 'string' || !TICKET_RE.test(ticket)) {
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

  const initialRating = clampRating(sp.r);
  const customer = typeof sp.c === 'string' ? sp.c : '';

  return (
    <FeedbackForm
      ticket={ticket}
      initialRating={initialRating}
      customer={customer}
    />
  );
}
