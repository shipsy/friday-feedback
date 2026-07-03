'use client';

import { useEffect, useRef, useState } from 'react';

const STARS = [1, 2, 3, 4, 5];
const LABELS = {
  1: '1 star — Very dissatisfied',
  2: '2 stars — Dissatisfied',
  3: '3 stars — Neutral',
  4: '4 stars — Satisfied',
  5: '5 stars — Very satisfied',
};

function errorMessage(code) {
  switch (code) {
    case 'invalid_rating':
      return 'Please select a rating from 1 to 5 stars.';
    case 'invalid_ticket':
      return 'This link is invalid.';
    case 'server_error':
      return 'We could not save your feedback. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function FeedbackForm({ ticket, initialRating, customer }) {
  const [rating, setRating] = useState(initialRating || 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — must stay empty
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState(''); // persistent live-region text
  const starRefs = useRef([]);
  const successHeadingRef = useRef(null);

  const shown = hover || rating;

  // On success, announce via the persistent live region and move focus to the
  // confirmation heading so keyboard/AT users are placed on it (a live region
  // that mounts already-populated is often not announced).
  useEffect(() => {
    if (status === 'success') {
      setAnnounce(`Thank you. Your rating for ticket ${ticket} is recorded.`);
      if (successHeadingRef.current) successHeadingRef.current.focus();
    }
  }, [status, ticket]);

  function focusStar(value) {
    const el = starRefs.current[value - 1];
    if (el) el.focus();
  }

  // ARIA radiogroup keyboard behavior: arrows move + select, Home/End jump.
  function onKeyDown(e) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp': {
        e.preventDefault();
        const next = Math.min(5, (rating || 0) + 1);
        setRating(next);
        focusStar(next);
        break;
      }
      case 'ArrowLeft':
      case 'ArrowDown': {
        e.preventDefault();
        const next = Math.max(1, (rating || 1) - 1);
        setRating(next);
        focusStar(next);
        break;
      }
      case 'Home':
        e.preventDefault();
        setRating(1);
        focusStar(1);
        break;
      case 'End':
        e.preventDefault();
        setRating(5);
        focusStar(5);
        break;
      default:
        break;
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!(rating >= 1 && rating <= 5)) {
      setError('Please select a rating from 1 to 5 stars.');
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
                Your rating
              </span>
              <div
                className="stars"
                role="radiogroup"
                aria-labelledby="rating-label"
                aria-required="true"
                onMouseLeave={() => setHover(0)}
              >
                {STARS.map((value) => {
                  const active = value <= shown;
                  const isChecked = value === rating;
                  const isFocusable = isChecked || (!rating && value === 1);
                  return (
                    <button
                      key={value}
                      type="button"
                      ref={(el) => {
                        starRefs.current[value - 1] = el;
                      }}
                      className={`star ${active ? 'star--on' : ''}`}
                      role="radio"
                      aria-checked={isChecked}
                      aria-label={LABELS[value]}
                      tabIndex={isFocusable ? 0 : -1}
                      onClick={() => setRating(value)}
                      onMouseEnter={() => setHover(value)}
                      onFocus={() => setHover(value)}
                      onBlur={() => setHover(0)}
                      onKeyDown={onKeyDown}
                    >
                      <span aria-hidden="true">★</span>
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
