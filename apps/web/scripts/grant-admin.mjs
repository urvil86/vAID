#!/usr/bin/env node
/**
 * Bootstrap the first admin.
 *
 * Staff roles are admin-assigned, so the very first admin must be granted
 * directly against the database. The account must already exist (sign up via
 * the app first), then run:
 *
 *   DATABASE_URL=postgres://... node apps/web/scripts/grant-admin.mjs you@clinic.com [CLINIC_ID]
 *
 * Works against any standard Postgres connection string (Neon in production,
 * or the local Docker Postgres on :5433). Uses node-postgres directly, so it
 * does not depend on the app's Neon HTTP driver.
 */
import process from 'node:process';

const email = process.argv[2];
const clinicId = process.argv[3] || null;
const url = process.env.DATABASE_URL;

if (!email || !url) {
  console.error('Usage: DATABASE_URL=postgres://... node grant-admin.mjs <email> [clinicId]');
  process.exit(1);
}

const { Client } = await import('pg').catch(() => {
  console.error('This script needs the "pg" package. Install it: yarn add -D pg');
  process.exit(1);
});

const client = new Client({ connectionString: url });
await client.connect();
const res = await client.query(
  `UPDATE "user" SET role = 'admin', clinic_id = COALESCE($2, clinic_id)
   WHERE lower(email) = lower($1) RETURNING id, email, role, clinic_id`,
  [email, clinicId]
);
await client.end();

if (res.rowCount === 0) {
  console.error(`No account found for ${email}. Sign up in the app first, then re-run.`);
  process.exit(1);
}
console.log('Granted admin:', res.rows[0]);
