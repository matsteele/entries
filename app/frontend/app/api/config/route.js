import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** GET /api/config — return all user config values */
export async function GET() {
  try {
    const result = await pool.query('SELECT key, value FROM user_config');
    const config = {};
    for (const row of result.rows) config[row.key] = row.value;
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PUT /api/config — update a config key { key, value } */
export async function PUT(request) {
  try {
    const { key, value } = await request.json();
    if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
    await pool.query(
      `INSERT INTO user_config (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
