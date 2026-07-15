'use client';

import { useEffect, useRef, useState } from 'react';

const OPTIONS = [
  { value: 'yes', label: 'Yes', aria: 'Yes — the response was helpful' },
  { value: 'no', label: 'No', aria: 'No — the response was not helpful' },
];

function errorMessage(code) {
  switch (code) {
    case 'invalid_rating':
      return 'Please choose Yes or No.';
    case 'invalid_ticket':
      return 'This link is invalid.';
    case 'server_error':
      return 'We could not save your feedback. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function FeedbackForm({ ticket, initialRating, customer }) {
  const [rating, setRating] = useState(initialRating || ''); // '' | 'yes' | 'no'
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — must stay empty
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState(''); // persistent live-region text
  const optionRefs = useRef([]);
  const successHeadingRef = useRef(null);

  // On success, announce via the persistent live region and move focus to the
  // confirmation heading so keyboard/AT users are placed on it (a live region
  // that mounts already-populated is often not announced).
  useEffect(() => {
    if (status === 'success') {
      setAnnounce(`Thank you. Your rating for ticket ${ticket} is recorded.`);
      if (successHeadingRef.current) successHeadingRef.current.focus();
    }
  }, [status, ticket]);

  function selectByIndex(index) {
    const clamped = (index + OPTIONS.length) % OPTIONS.length;
    const opt = OPTIONS[clamped];
    setRating(opt.value);
    const el = optionRefs.current[clamped];
    if (el) el.focus();
  }

  // ARIA radiogroup keyboard behavior: arrows move + select, Home/End jump.
  function onKeyDown(e) {
    const current = OPTIONS.findIndex((o) => o.value === rating);
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        selectByIndex(current < 0 ? 0 : current + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        selectByIndex(current < 0 ? 0 : current - 1);
        break;
      case 'Home':
        e.preventDefault();
        selectByIndex(0);
        break;
      case 'End':
        e.preventDefault();
        selectByIndex(OPTIONS.length - 1);
        break;
      default:
        break;
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (rating !== 'yes' && rating !== 'no') {
      setError('Please choose Yes or No.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, rating, comment, customer, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setError(errorMessage(data.error));
      }
    } catch {
      setStatus('error');
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <>
      {/* Persistent, always-mounted live region so status changes are announced. */}
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>

      {status === 'success' ? (
        <section className="card">
          <h1 tabIndex={-1} ref={successHeadingRef}>
            Thanks!
          </h1>
          <p>
            Your rating for <strong>{ticket}</strong> is recorded.
          </p>
        </section>
      ) : (
        <section className="card">
          <h1>How helpful was the AI&apos;s response?</h1>
          <p className="muted">
            Ticket <strong>{ticket}</strong>
          </p>

          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <span id="rating-label" className="label">
                Was the response helpful?
              </span>
              <div
                className="choices"
                role="radiogroup"
                aria-labelledby="rating-label"
                aria-required="true"
              >
                {OPTIONS.map((opt, index) => {
                  const isChecked = opt.value === rating;
                  const isFocusable = isChecked || (!rating && index === 0);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      className={`choice ${isChecked ? 'choice--on' : ''}`}
                      role="radio"
                      aria-checked={isChecked}
                      aria-label={opt.aria}
                      tabIndex={isFocusable ? 0 : -1}
                      onClick={() => setRating(opt.value)}
                      onKeyDown={onKeyDown}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="comment">
                Comment <span className="muted">(optional)</span>
              </label>
              <textarea
                id="comment"
                name="comment"
                maxLength={1000}
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us more (optional)"
              />
              <span className="muted count">{comment.length}/1000</span>
            </div>

            {/* Honeypot — hidden from users and assistive tech; must stay empty. */}
            <div className="hp" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              className="submit"
              type="submit"
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Submitting…' : 'Submit feedback'}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
