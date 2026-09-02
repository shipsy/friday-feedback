import assert from 'node:assert/strict';
import test from 'node:test';

import { HEADER_ROW } from './questions.js';
import { mergeRow } from './sheets.js';

const T0 = '2026-08-27T10:14:02.118Z';
const T1 = '2026-08-27T10:15:31.902Z';

const base = { customer: '', userAgent: 'UA', answers: {} };

test('a rating-only write creates the row', () => {
  const row = mergeRow({ ...base, existing: undefined, ticket: 'TKT-1', rating: 'no', now: T0 });
  assert.deepEqual(row, ['TKT-1', 'no', T0, T0, '', 'UA', '', '', '']);
  assert.equal(row.length, HEADER_ROW.length);
});

test('a yes rating records and asks nothing — answer cells stay empty', () => {
  const row = mergeRow({ ...base, existing: undefined, ticket: 'TKT-2', rating: 'yes', now: T0 });
  assert.equal(row[1], 'yes');
  assert.deepEqual(row.slice(6), ['', '', '']);
});

test('the answers write MUST NOT blank the rating recorded on arrival', () => {
  const created = mergeRow({ ...base, existing: undefined, ticket: 'TKT-1', rating: 'no', now: T0 });
  const patched = mergeRow({
    ...base,
    existing: created,
    ticket: 'TKT-1',
    rating: '', // absent from the payload
    answers: { cust_problem: 'didnt_match,no_fix', outcome: 'human', cust_needed: 'fix the sync' },
    now: T1,
  });
  assert.equal(patched[1], 'no', 'rating preserved');
  assert.equal(patched[2], T0, 'submitted_at set once');
  assert.equal(patched[3], T1, 'updated_at advances');
  assert.deepEqual(patched.slice(6), ['didnt_match,no_fix', 'human', 'fix the sync']);
});

test('a rating write MUST NOT blank answers already submitted', () => {
  const withAnswers = ['TKT-3', '', T0, T0, '', 'UA', 'cant_do_it', 'open', 'unblock us'];
  const row = mergeRow({ ...base, existing: withAnswers, ticket: 'TKT-3', rating: 'yes', now: T1 });
  assert.equal(row[1], 'yes');
  assert.deepEqual(row.slice(6), ['cant_do_it', 'open', 'unblock us']);
});

test('an untouched question never overwrites its cell', () => {
  const existing = ['TKT-4', 'no', T0, T0, '', 'UA', 'no_fix', 'human', 'earlier note'];
  const row = mergeRow({
    ...base,
    existing,
    ticket: 'TKT-4',
    rating: '',
    answers: { outcome: 'open' }, // only this one was answered
    now: T1,
  });
  assert.equal(row[6], 'no_fix', 'left alone');
  assert.equal(row[7], 'open', 'updated');
  assert.equal(row[8], 'earlier note', 'left alone');
});

test('a row written under a narrower schema is padded on read', () => {
  const short = ['TKT-5', 'yes', T0, T0, '', 'UA'];
  const row = mergeRow({
    ...base,
    existing: short,
    ticket: 'TKT-5',
    rating: '',
    answers: { cust_needed: 'late arrival' },
    now: T1,
  });
  assert.equal(row.length, HEADER_ROW.length);
  assert.equal(row[1], 'yes');
  assert.equal(row[8], 'late arrival');
});

test('free text that opens with a formula trigger is neutralised', () => {
  const row = mergeRow({
    ...base,
    existing: undefined,
    ticket: 'TKT-6',
    rating: 'no',
    answers: { cust_needed: '=HYPERLINK("http://evil","click")' },
    now: T0,
  });
  assert.ok(row[8].startsWith("'="), 'leading = prefixed so a CSV re-import cannot execute it');
  // The ticket is the match key and must stay byte-exact.
  assert.equal(row[0], 'TKT-6');
});
