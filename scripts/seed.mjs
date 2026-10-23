#!/usr/bin/env node
// Loads the fictional demo register. Safe to run again: existing rows are left alone.
import fs from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';

const db = await getDb();
try {
  await db.exec(fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8'));
  console.log('Seed complete: 3 fictional funds, 11 fictional holders.');
} finally {
  await db.close();
}
