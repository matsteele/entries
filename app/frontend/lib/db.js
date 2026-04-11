import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { Pool } = _require('pg');

let pgPool = null;
try {
  pgPool = new Pool({ connectionString: 'postgresql://matthewsteele@localhost:5432/entries' });
} catch (e) {
  console.warn('pg not available:', e.message);
}

export { pgPool };
