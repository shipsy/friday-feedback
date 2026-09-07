#!/usr/bin/env node
// node scripts/link.js TKT-93849
//
// Manual / smoke-test link generation. Friday mints its own links inline with the
// shared secret (docs/sdd/friday_link_generation_spec.md) — this is not that path.

// Load env the way Next.js does: .env.local wins, .env is the fallback, and a
// real shell variable beats both (process.loadEnvFile never overrides a var that
// is already set, so load order IS precedence order). Missing files are fine.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // not present, or unreadable — keep going
  }
}

const { makeToken } = await import('../lib/token.js');

const raw = process.argv[2];
if (!raw) {
  console.error('usage: node scripts/link.js <TICKET>');
  process.exit(1);
}

const base = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

let token;
try {
  token = makeToken(raw);
} catch (err) {
  console.error(`error: ${err.message}`);
  if (/FEEDBACK_LINK_SECRET/.test(err.message)) {
    console.error(
      'Set it in .env.local (see .env.local.example), or export it in this shell.\n' +
        'Generate one with: openssl rand -base64 32',
    );
  }
  process.exit(1);
}

const url = `${base}/${token}`;
console.log(`token   ${token}`);
console.log(`url     ${url}`);
console.log(`yes     ${url}?r=yes`);
console.log(`no      ${url}?r=no`);
