'use client';

import { useEffect, useRef, useState } from 'react';
import { labelFor, questionsFor } from '@/lib/questions';

// Three modes, decided by how the link was opened:
//
//   ?r=yes  THANKS    the tap was the whole interaction — record it, say thanks.
//   ?r=no   QUESTIONS record the no, then ask what went wrong.
//   (none)  FORM      the classic page: Yes/No + a comment, and the reason
//                     questions appear the moment they pick No.
//
// FORM is the only mode with a rating control. The reveal uses the same
// `showWhen` gate as the arrival links — the rating is just in-page state there
// instead of a URL param.
const THANKS = 'thanks';
const QUESTIONS_ONLY = 'questions';
const FORM = 'form';

const RATING_OPTIONS = [
  { value: 'yes', label: 'Yes', aria: 'Yes — the response was helpful' },
  { value: 'no', label: 'No', aria: 'No — the response was not helpful' },
];

function errorMessage(code) {
  switch (code) {
    case 'invalid_link':
      return 'This link has expired or is invalid.';
    case 'server_error':
      return 'We could not save your feedback. Please try again shortly.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

async function post(payload) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || 'request_failed');
    err.code = data.error;
    throw err;
  }
  return data;
}

export default function Questionnaire({ token, ticket, arrivalRating, customer }) {
  const mode =
    arrivalRating === 'yes' ? THANKS : arrivalRating === 'no' ? QUESTIONS_ONLY : FORM;

  // The rating write and the answers write are independent, and must not gate
  // each other — the customer can start answering while the arrival POST flies.
  const [ratingStatus, setRatingStatus] = useState('idle'); // idle|saving|saved|failed
  const [formStatus, setFormStatus] = useState('ready'); // ready|submitting|done|error
  const [rating, setRating] = useState(arrivalRating || ''); // FORM: in-page choice
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState('');
  const fired = useRef(false);
  const doneHeadingRef = useRef(null);
  const ratingRefs = useRef([]);

  const questions = questionsFor(rating);

  // Record the arrival rating on mount. Client-side, not during the server
  // render, so HTML-only email scanners and prefetchers record nothing.
  // Idempotent — a reload re-writes the same value into the same row.
  useEffect(() => {
    if (fired.current || !arrivalRating) return;
    fired.current = true;
    setRatingStatus('saving');
    post({ token, rating: arrivalRating, customer, website: '' })
      .then(() => setRatingStatus('saved'))
      .catch(() => setRatingStatus('failed'));
  }, [arrivalRating, token, customer]);

  useEffect(() => {
    if (mode === THANKS && ratingStatus === 'saved') {
      setAnnounce('Thanks — your rating is recorded.');
    }
  }, [mode, ratingStatus]);

  useEffect(() => {
    if (formStatus === 'done') {
      setAnnounce('Thanks — your feedback is recorded.');
      if (doneHeadingRef.current) doneHeadingRef.current.focus();
    }
  }, [formStatus]);

  function setAnswer(id, value) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function toggleMulti(q, value) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[q.id]) ? prev[q.id] : [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : current.length >= (q.max ?? 4)
          ? current
          : [...current, value];
      return { ...prev, [q.id]: next };
    });
  }

  async function onSubmit(e) {
    if (e) e.preventDefault();
    setError('');
    // FORM mode keeps the classic requirement: pick Yes or No before submitting.
    if (mode === FORM && rating !== 'yes' && rating !== 'no') {
      setError('Please choose Yes or No.');
      setFormStatus('error');
      return;
    }
    setFormStatus('submitting');
    try {
      // Only send answers for questions actually on screen: a reason chip picked
      // before switching back to Yes must not be written. Absent ids leave their
      // cells alone (lib/questions.js sanitizeAnswers).
      const visible = {};
      for (const q of questions) {
        if (q.id in answers) visible[q.id] = answers[q.id];
      }
      // The rating is resent whenever known: if the arrival POST was lost this
      // recovers it, and if it succeeded the merge rewrites the same value.
      await post({
        token,
        ...(rating ? { rating } : {}),
        answers: visible,
        customer,
        website: '',
      });
      setFormStatus('done');
    } catch (err) {
      setFormStatus('error');
      setError(errorMessage(err.code));
    }
  }

  // ARIA radiogroup keyboard behaviour, shared by the rating control and any
  // single-choice question: arrows move and select, Home/End jump.
  function radioKeyDown(e, values, current, onPick, refs) {
    let next = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current < 0 ? 0 : (current + 1) % values.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current < 0 ? 0 : (current - 1 + values.length) % values.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = values.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    onPick(values[next]);
    const el = refs ? refs[next] : document.getElementById(`q-${values[next]}`);
    if (el && el.focus) el.focus();
  }

  const liveRegion = (
    <div className="sr-only" aria-live="polite" role="status">
      {announce}
    </div>
  );

  if (mode === THANKS) {
    return (
      <>
        {liveRegion}
        <section className="card">
          <h1>Thanks for rating</h1>
          <p className="muted">
            Your rating for <strong>{ticket}</strong> is recorded.
          </p>
          {ratingStatus === 'failed' ? (
            <p className="error" role="alert">
              We could not save your rating. Please reopen the link from your
              email to try again.
            </p>
          ) : null}
        </section>
      </>
    );
  }

  if (formStatus === 'done') {
    return (
      <>
        {liveRegion}
        <section className="card">
          <h1 tabIndex={-1} ref={doneHeadingRef}>
            Thanks — that helps
          </h1>
          <p className="muted">
            Your feedback for <strong>{ticket}</strong> is recorded. A support
            engineer will see it with the ticket.
          </p>
        </section>
      </>
    );
  }

  const heading =
    mode === QUESTIONS_ONLY
      ? 'Sorry that response missed the mark'
      : "How helpful was the AI's response?";

  return (
    <>
      {liveRegion}
      <section className="card">
        <h1>{heading}</h1>
        <p className="muted">
          {mode === QUESTIONS_ONLY
            ? 'Your rating is recorded. A few quick questions so we can fix it — all optional. '
            : ''}
          Ticket <strong>{ticket}</strong>
        </p>

        <form onSubmit={onSubmit} noValidate>
          {mode === FORM ? (
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
                {RATING_OPTIONS.map((opt, index) => {
                  const checked = opt.value === rating;
                  const focusable = checked || (!rating && index === 0);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      ref={(el) => {
                        ratingRefs.current[index] = el;
                      }}
                      className={`choice ${checked ? 'choice--on' : ''}`}
                      role="radio"
                      aria-checked={checked}
                      aria-label={opt.aria}
                      tabIndex={focusable ? 0 : -1}
                      onClick={() => setRating(opt.value)}
                      onKeyDown={(e) =>
                        radioKeyDown(
                          e,
                          RATING_OPTIONS.map((o) => o.value),
                          RATING_OPTIONS.findIndex((o) => o.value === rating),
                          setRating,
                          ratingRefs.current,
                        )
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {questions.map((q) => {
            const legend = labelFor(q, rating);
            return (
              <fieldset className="field" key={q.id}>
                <legend className="label">
                  {legend}
                  {q.type === 'text' ? (
                    <span className="muted"> (optional)</span>
                  ) : null}
                </legend>

                {q.type === 'multi' ? (
                  <div className="chips" role="group" aria-label={legend}>
                    {q.options.map((o) => {
                      const selected =
                        Array.isArray(answers[q.id]) && answers[q.id].includes(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          className={`chip ${selected ? 'chip--on' : ''}`}
                          aria-pressed={selected}
                          onClick={() => toggleMulti(q, o.value)}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {q.type === 'single' ? (
                  <div className="chips" role="radiogroup" aria-label={legend}>
                    {q.options.map((o, index) => {
                      const selected = answers[q.id] === o.value;
                      const focusable = selected || (!answers[q.id] && index === 0);
                      return (
                        <button
                          key={o.value}
                          id={`q-${o.value}`}
                          type="button"
                          className={`chip ${selected ? 'chip--on' : ''}`}
                          role="radio"
                          aria-checked={selected}
                          tabIndex={focusable ? 0 : -1}
                          onClick={() => setAnswer(q.id, o.value)}
                          onKeyDown={(e) =>
                            radioKeyDown(
                              e,
                              q.options.map((x) => x.value),
                              q.options.findIndex((x) => x.value === answers[q.id]),
                              (v) => setAnswer(q.id, v),
                            )
                          }
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {q.type === 'text' ? (
                  <>
                    <textarea
                      id={q.id}
                      rows={4}
                      maxLength={q.maxLength}
                      value={answers[q.id] || ''}
                      placeholder={q.placeholder || ''}
                      aria-describedby={`${q.id}-count`}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    />
                    <span className="muted count" id={`${q.id}-count`}>
                      {(answers[q.id] || '').length}/{q.maxLength}
                    </span>
                  </>
                ) : null}
              </fieldset>
            );
          })}

          {/* Honeypot — hidden from users and assistive tech; must stay empty. */}
          <div className="hp" aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="submit" type="submit" disabled={formStatus === 'submitting'}>
            {formStatus === 'submitting' ? 'Submitting…' : 'Submit feedback'}
          </button>
        </form>
      </section>
    </>
  );
}
