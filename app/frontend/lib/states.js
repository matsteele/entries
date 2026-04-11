import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const STATES_DIR = path.join(__dirname, '../../../tracking/states');

export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function loadStateFile(dateStr) {
  const p = path.join(STATES_DIR, `${dateStr}.json`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function computeStateDefaults(excludeDate, days = 14) {
  const sums = { focused: {}, stressed: {}, energy: {} };
  const counts = { focused: {}, stressed: {}, energy: {} };
  const today = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = localDateStr(d);
    if (ds === excludeDate) continue;
    const data = loadStateFile(ds);
    if (!data) continue;
    for (const metric of ['focused', 'stressed', 'energy']) {
      for (const [h, v] of Object.entries(data[metric] || {})) {
        sums[metric][h] = (sums[metric][h] || 0) + v;
        counts[metric][h] = (counts[metric][h] || 0) + 1;
      }
    }
  }
  const defaults = { focused: {}, stressed: {}, energy: {} };
  for (const metric of ['focused', 'stressed', 'energy']) {
    for (const h of Object.keys(sums[metric])) {
      defaults[metric][h] = Math.round(sums[metric][h] / counts[metric][h]);
    }
  }
  return defaults;
}
