import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
export const dynamic = 'force-dynamic';

const DATA_PATH = path.resolve(process.cwd(), '..', '..', 'tracking', 'supplements.json');

function load() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

export async function GET() {
  try {
    const data = load();
    if (!data.history) data.history = {};
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = load();
    if (!data.history) data.history = {};
    const { action } = body;
    const now = new Date().toISOString();
    const today = todayStr();

    switch (action) {
      case 'take': {
        const { supplementId } = body;
        if (!data.history[supplementId]) data.history[supplementId] = [];
        data.history[supplementId].push(now);
        break;
      }
      case 'untake': {
        // Remove the most recent entry for today
        const { supplementId } = body;
        const entries = data.history[supplementId] || [];
        const idx = entries.findLastIndex(ts => ts.startsWith(today));
        if (idx >= 0) entries.splice(idx, 1);
        break;
      }
      case 'take-all': {
        const { supplementIds } = body;
        for (const id of supplementIds) {
          if (!data.history[id]) data.history[id] = [];
          // Only add if not already taken today
          const alreadyToday = (data.history[id] || []).some(ts => ts.startsWith(today));
          if (!alreadyToday) data.history[id].push(now);
        }
        break;
      }
      case 'toggle-stock': {
        const { supplementId } = body;
        const supp = data.supplements.find(s => s.id === supplementId);
        if (supp) supp.inStock = !supp.inStock;
        break;
      }
      case 'add-supplement': {
        const { id, name, category, description, dosage, protocols } = body;
        data.supplements.push({
          id: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name, category, description, dosage,
          inStock: false,
          protocols: protocols || [],
        });
        break;
      }
      case 'update-supplement': {
        const { supplementId, updates } = body;
        const supp = data.supplements.find(s => s.id === supplementId);
        if (supp) Object.assign(supp, updates);
        break;
      }
      case 'delete-supplement': {
        const { supplementId } = body;
        data.supplements = data.supplements.filter(s => s.id !== supplementId);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Migrate: remove old takenToday field if present
    delete data.takenToday;
    delete data.lastReset;

    save(data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
