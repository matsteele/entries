import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { loadStateFile, computeStateDefaults, STATES_DIR } from '@/lib/states';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { date } = await params;
    const data = loadStateFile(date);
    const defaults = computeStateDefaults(date);
    return NextResponse.json({ date, data, defaults });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    const { date } = await params;
    const body = await request.json();
    if (!fs.existsSync(STATES_DIR)) fs.mkdirSync(STATES_DIR, { recursive: true });
    fs.writeFileSync(path.join(STATES_DIR, `${date}.json`), JSON.stringify(body, null, 2));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
