import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const BASE_DIR = process.env.ENTRIES_BASE_DIR || '/Users/matthewsteele/projects/currentProjects/entries';
const WORKOUT_FILE = path.join(BASE_DIR, 'tracking', 'workout-log.json');

const WARMUPS = {
  back:      ['8 Min Abs', 'Pull ups (3x6)', 'Inverted Rows', 'KB Swings', 'Double Unders'],
  chest:     ['8 Min Abs', 'Dips (3x8)', '60 Burpees', 'Pull ups (3x6)', 'Double Unders'],
  legs:      ['Hip Thrusters (5x20)', 'Jumping Squats', 'KB Swings', '30 Ab Hold Lifts', 'Double Unders'],
  shoulders: ['8 Min Abs', 'Dips (3x8)', 'Pull ups (3x6)', 'KB Swings', '60 Burpees'],
  core:      ['8 Min Abs', '30 Ab Hold Lifts', 'Hip Thrusters (5x20)', 'KB Swings', 'Double Unders'],
};

const SKILLS = [
  'Parallette planche lean (5x15s)',
  'Handstand holds (5x30s)',
  'Ring muscle up negatives',
  'Bar muscle up practice',
  'Banded muscle ups',
  'Pistol squat progressions',
  'Rope climb technique',
  'Weighted pull up practice',
  'Snatch technique (light)',
  'Ring dips (3x10)',
  'HSPU against wall (3x5)',
  'KB complex',
  'False grip ring rows',
];

const WODS = [
  { name: 'Helen', description: '3 rounds: 400m run, 21 KB swings, 12 pull ups' },
  { name: 'Fran', description: '21-15-9: thrusters (95/65), pull ups' },
  { name: 'Angie', description: '100 pull ups, 100 push ups, 100 sit ups, 100 squats' },
  { name: 'Chelsea', description: 'Every minute for 30min: 5 pull ups, 10 push ups, 15 squats' },
  { name: 'Kalsu', description: '100 thrusters — every minute do 5 burpees' },
  { name: 'Filthy 50', description: '50 each: box jumps, jumping pull ups, KB swings, lunges, K2E, push press, back ext, wall balls, burpees, DUs' },
  { name: 'Nate', description: 'AMRAP 20min: 2 muscle ups, 4 HSPU, 8 KB swings' },
  { name: 'Strength Burnout', description: 'Max rep complex at 60%: clean, front squat, push press, back squat' },
  { name: 'High Shoulders', description: '5 rounds: 10 hang cleans, 10 push press, 10 front squats' },
  { name: 'DeadLift EMOM', description: 'EMOM 10min: 3 deadlifts at 80%' },
  { name: 'Core Focus', description: '4 rounds: 20 GHD sit ups, 20 back extensions, 30 hollow rocks' },
  { name: 'Pull Up Grind', description: 'Every 2min x10: max pull ups (stop 2 short of failure)' },
  { name: 'Bike The Pain Away', description: '10 rounds: 1min assault bike, 1min rest' },
  { name: 'Rounds of Glory', description: 'AMRAP 15min: 10 pull ups, 10 ring dips, 10 box jumps' },
  { name: 'Snatch and Pull', description: '5 rounds: 3 snatch + 3 snatch pull at 70%' },
  { name: 'Olympic Fran', description: '21-15-9: hang squat cleans (95/65), ring dips' },
  { name: 'Wipeout', description: '43 reps: deadlift (225), box jump (24"), push up, clean (135)' },
  { name: 'Long Haul Arms', description: '5 rounds: 15 barbell curls, 15 skull crushers, 15 upright rows' },
  { name: 'Chest Blow Out', description: '4 rounds: 15 bench press, 15 cable flyes, 15 push ups, 15 dips' },
  { name: 'BackSquat Row', description: 'EMOM 12min: odd=5 back squats @70%, even=8 bent over rows' },
  { name: 'Super Legs', description: '4 rounds: 10 front squats, 20 lunges, 30 box jumps, 40 air squats' },
];

const CASHOUTS = {
  back:      ['Shrugs (4x15 @ 65lbs)', 'Bent Over T-Bar Rows', 'DB Curls (3x20 @ 20lbs)', 'Cable Fly Crossovers (5x20)', 'Arm Circuit (3x10 @ 65lbs)'],
  chest:     ['Skull Crushers', 'Tri Pulldowns', 'Cable Fly Crossovers (5x20)', 'Dips to failure', 'Arm Circuit (3x10 @ 65lbs)'],
  legs:      ['Bulgarian Split Squats', 'Calf Raises', 'Leg Lifts', 'Hip Thrusters (3x15)', 'Lateral Raises'],
  shoulders: ['Lateral Raises', 'Shrugs (4x15 @ 65lbs)', 'DB Curls (3x20 @ 20lbs)', 'Tri Pulldowns', 'Skull Crushers'],
  core:      ['Leg Lifts', 'Calf Raises', 'Lateral Raises', 'Split 100 Barbell Curls (45lb bar)'],
};

const WEEKLY_PROGRAM = {
  0: { focus: 'Back',  focusKey: 'back',  strength: ['bent_over_rows', 'deadlift', 'bicep_curls'] },
  1: { focus: 'Chest', focusKey: 'chest', strength: ['bench_press', 'military_press'] },
  2: { focus: 'Legs',  focusKey: 'legs',  strength: ['front_squat', 'back_squat', 'deadlift'] },
  3: { focus: 'Back',  focusKey: 'back',  strength: ['bent_over_rows', 'military_press', 'bicep_curls'] },
  4: { focus: 'Chest', focusKey: 'chest', strength: ['bench_press', 'military_press'] },
  5: { focus: 'Back',  focusKey: 'back',  strength: ['bent_over_rows', 'deadlift', 'snatch'] },
  6: { focus: 'Legs',  focusKey: 'legs',  strength: ['front_squat', 'back_squat', 'deadlift'] },
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfYear() {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
}

function pick(arr) { return arr[dayOfYear() % arr.length]; }
function pickTwo(arr) {
  const d = dayOfYear();
  const i1 = d % arr.length;
  const i2 = (d + 3) % arr.length;
  return i1 === i2 ? [arr[i1], arr[(i1 + 1) % arr.length]] : [arr[i1], arr[i2]];
}

function readData() {
  if (!existsSync(WORKOUT_FILE)) return { movements: {}, bodyweight: [] };
  return JSON.parse(readFileSync(WORKOUT_FILE, 'utf-8'));
}

function writeData(data) {
  writeFileSync(WORKOUT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  const data = readData();
  const dow = new Date().getDay();
  const base = WEEKLY_PROGRAM[dow];
  const fk = base.focusKey;

  const program = {
    day: DAYS[dow],
    dayOfWeek: dow,
    focus: base.focus,
    warmup: pick(WARMUPS[fk] || WARMUPS.core),
    skill: pick(SKILLS),
    wod: pick(WODS),
    wod2: pickTwo(WODS)[1],
    strength: base.strength,
    cashout: pickTwo(CASHOUTS[fk] || CASHOUTS.core),
  };

  return Response.json({ program, movements: data.movements, bodyweight: data.bodyweight });
}

export async function POST(request) {
  const body = await request.json();
  const { movement, weight, reps, sets, notes = '' } = body;
  const data = readData();
  if (!data.movements[movement]) return Response.json({ error: 'Unknown movement' }, { status: 400 });
  data.movements[movement].logs.push({ date: new Date().toISOString().split('T')[0], weight, reps, sets, notes });
  writeData(data);
  return Response.json({ movement: data.movements[movement] });
}
