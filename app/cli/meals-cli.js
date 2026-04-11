#!/usr/bin/env node
/**
 * /meals — Describe what you ate, get macros estimated via GPT, optionally save/log it.
 *
 * Usage:
 *   node meals-cli.js "chicken rice bowl with broccoli"       # estimate macros only
 *   node meals-cli.js "chicken rice bowl" -reg [category]     # save to meals library
 *   node meals-cli.js "chicken rice bowl" -now [slot]         # log as eating now (slot 1-5, auto-assigns next empty)
 *   node meals-cli.js "chicken rice bowl" -plan [slot]        # plan meal for today
 *   node meals-cli.js list                                    # list saved meals by protein
 *   node meals-cli.js grocery [date]                         # generate grocery list from planned meals
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}

async function estimateMacros(description) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a nutrition expert. Given a meal description, estimate macronutrients.
Return ONLY valid JSON in this exact format, no markdown:
{
  "name": "Clean meal name",
  "protein": <grams as integer>,
  "carbs": <grams as integer>,
  "fat": <grams as integer>,
  "calories": <integer>,
  "ingredients": ["ingredient1", "ingredient2"],
  "notes": "Brief note on assumptions made"
}`
        },
        { role: 'user', content: `Estimate macros for: ${description}` }
      ],
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) throw new Error('No response from OpenAI');
  return JSON.parse(data.choices[0].message.content.trim());
}

async function findOrCreateMeal(macros, category) {
  // Check if a meal with the same name already exists
  const existing = await pool.query(`SELECT id FROM meals WHERE LOWER(name) = LOWER($1)`, [macros.name]);
  if (existing.rows[0]) return existing.rows[0].id;

  const result = await pool.query(
    `INSERT INTO meals (name, category, ingredients, protein, carbs, fat, calories)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [macros.name, category || 'snack', macros.ingredients || [],
     macros.protein, macros.carbs, macros.fat, macros.calories]
  );
  return result.rows[0].id;
}

async function getNextEmptySlot(date) {
  const SLOTS = ['meal-1', 'meal-2', 'meal-3', 'meal-4', 'meal-5'];
  const used = await pool.query(`SELECT slot FROM meal_plans WHERE date = $1`, [date]);
  const usedSlots = new Set(used.rows.map(r => r.slot));
  return SLOTS.find(s => !usedSlots.has(s)) || 'meal-5';
}

async function logMealSlot(date, slot, mealId, status) {
  const eatenAt = status === 'eating' || status === 'eaten' ? new Date().toISOString() : null;
  await pool.query(
    `INSERT INTO meal_plans (date, slot, meal_id, status, eaten_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (date, slot) DO UPDATE SET
       meal_id  = EXCLUDED.meal_id,
       status   = EXCLUDED.status,
       eaten_at = COALESCE(EXCLUDED.eaten_at, meal_plans.eaten_at)`,
    [date, slot, mealId, status, eatenAt]
  );
}

// Fuzzy search: score meals by word overlap with the query
async function searchMeals(query) {
  const result = await pool.query(
    `SELECT id, name, category, protein, carbs, fat, calories, ingredients FROM meals ORDER BY protein DESC`
  );
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = result.rows.map(m => {
    const haystack = m.name.toLowerCase();
    const matches = words.filter(w => haystack.includes(w)).length;
    const score = matches / Math.max(words.length, 1);
    return { ...m, score };
  });
  return scored.filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}

async function logMealById(mealId, slot, date, status) {
  const eatenAt = (status === 'eaten' || status === 'eating') ? new Date().toISOString() : null;
  await pool.query(
    `INSERT INTO meal_plans (date, slot, meal_id, status, eaten_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (date, slot) DO UPDATE SET
       meal_id  = EXCLUDED.meal_id,
       status   = EXCLUDED.status,
       eaten_at = COALESCE(EXCLUDED.eaten_at, meal_plans.eaten_at)`,
    [date, slot, mealId, status, eatenAt]
  );
}

async function listMeals() {
  const result = await pool.query(
    `SELECT name, category, protein, carbs, fat, calories
     FROM meals ORDER BY category, protein DESC`
  );

  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row);
  }

  for (const [cat, meals] of Object.entries(grouped)) {
    console.log(`\n${cat.toUpperCase()}`);
    for (const m of meals) {
      console.log(`  ${m.name.padEnd(35)} P:${String(m.protein).padStart(3)}g  C:${String(m.carbs).padStart(3)}g  F:${String(m.fat).padStart(3)}g  ${m.calories} kcal`);
    }
  }
}

async function groceryList(date) {
  const result = await pool.query(
    `SELECT m.name, m.ingredients, m.category, mp.status
     FROM meal_plans mp
     JOIN meals m ON mp.meal_id = m.id
     WHERE mp.date = $1 AND mp.meal_id IS NOT NULL
     ORDER BY mp.slot`,
    [date]
  );

  if (!result.rows.length) {
    console.log(`No meals planned for ${date}`);
    return;
  }

  console.log(`\n🛒 Grocery list for ${date}:\n`);

  // Aggregate all ingredients
  const allIngredients = new Map();
  for (const row of result.rows) {
    const label = row.status === 'eaten' ? '✓' : row.status === 'eating' ? '⏺' : '·';
    console.log(`  ${label} ${row.name} (${row.status || 'planned'})`);
    for (const ing of (row.ingredients || [])) {
      if (!allIngredients.has(ing)) allIngredients.set(ing, 0);
      allIngredients.set(ing, allIngredients.get(ing) + 1);
    }
  }

  if (allIngredients.size) {
    console.log('\n📦 Ingredients needed:');
    for (const [ing, count] of [...allIngredients.entries()].sort()) {
      const qty = count > 1 ? ` ×${count}` : '';
      console.log(`  - ${ing}${qty}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (!args.length) {
    console.log('Usage: meals-cli.js "description" [-reg|-now|-plan] [category|slot] | list | grocery [date]');
    await pool.end();
    return;
  }

  if (args[0] === 'list') {
    await listMeals();
    await pool.end();
    return;
  }

  if (args[0] === 'grocery') {
    const date = args[1] || todayStr();
    await groceryList(date);
    await pool.end();
    return;
  }

  // search <query> — used by Claude to find close matches, outputs JSON
  if (args[0] === 'search') {
    const query = args.slice(1).join(' ');
    const matches = await searchMeals(query);
    console.log(JSON.stringify(matches, null, 2));
    await pool.end();
    return;
  }

  // log-new <json> — used by Claude to create a new meal and log it
  // json: { name, category, ingredients, protein, carbs, fat, calories, status, slot, date }
  if (args[0] === 'log-new') {
    const payload = JSON.parse(args[1]);
    const { name, category, ingredients, protein, carbs, fat, calories, status, slot, date } = payload;
    const finalDate = date || todayStr();
    const id = await findOrCreateMeal({ name, ingredients, protein, carbs, fat, calories }, category);
    const finalSlot = slot || await getNextEmptySlot(finalDate);
    await logMealById(id, finalSlot, finalDate, status || 'eaten');
    console.log(`✓ Saved & logged "${name}" as ${status||'eaten'} in ${finalSlot} for ${finalDate}`);
    console.log(`  ${protein}g P · ${carbs}g C · ${fat}g F · ${calories} kcal`);
    await pool.end();
    return;
  }

  // log <json> — used by Claude to log a confirmed meal
  // json: { mealId, slot, date, status }
  if (args[0] === 'log') {
    const payload = JSON.parse(args[1]);
    const { mealId, slot, date, status } = payload;
    const finalSlot = slot || await getNextEmptySlot(date || todayStr());
    const finalDate = date || todayStr();
    await logMealById(mealId, finalSlot, finalDate, status || 'eaten');
    const meal = await pool.query('SELECT name, protein, carbs, fat, calories FROM meals WHERE id=$1', [mealId]);
    const m = meal.rows[0];
    console.log(`✓ Logged "${m.name}" as ${status||'eaten'} in ${finalSlot} for ${finalDate}`);
    console.log(`  ${m.protein}g P · ${m.carbs}g C · ${m.fat}g F · ${m.calories} kcal`);
    await pool.end();
    return;
  }

  const saveFlag  = args.includes('-reg');
  const nowFlag   = args.includes('-now');
  const planFlag  = args.includes('-plan');
  const filteredArgs = args.filter(a => ![ '-reg', '-now', '-plan' ].includes(a));

  // Detect if last arg is a category or slot override
  const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack'];
  const SLOT_RE = /^meal-[1-5]$|^[1-5]$/;
  let category = null;
  let slotOverride = null;
  let descArgs = [...filteredArgs];

  const last = descArgs[descArgs.length - 1]?.toLowerCase();
  if (descArgs.length > 1) {
    if (CATEGORIES.includes(last)) { category = descArgs.pop().toLowerCase(); }
    else if (SLOT_RE.test(last)) {
      const raw = descArgs.pop();
      slotOverride = raw.startsWith('meal-') ? raw : `meal-${raw}`;
    }
  }

  const description = descArgs.join(' ');
  if (!description) {
    console.error('Usage: meals-cli.js "meal description" [-reg|-now|-plan] [category|slot]');
    process.exit(1);
  }

  console.log(`Estimating macros for: "${description}"...`);
  const macros = await estimateMacros(description);

  console.log(`\n${macros.name}`);
  console.log(`  Protein:  ${macros.protein}g`);
  console.log(`  Carbs:    ${macros.carbs}g`);
  console.log(`  Fat:      ${macros.fat}g`);
  console.log(`  Calories: ${macros.calories} kcal`);
  if (macros.ingredients?.length) console.log(`  Ingredients: ${macros.ingredients.join(', ')}`);
  if (macros.notes) console.log(`  Notes: ${macros.notes}`);

  const date = todayStr();

  if (saveFlag) {
    const id = await findOrCreateMeal(macros, category);
    console.log(`\n✓ Saved to meals library as "${macros.name}" (${category || 'snack'})`);
    if (nowFlag || planFlag) {
      const slot = slotOverride || await getNextEmptySlot(date);
      const status = nowFlag ? 'eating' : 'planned';
      await logMealSlot(date, slot, id, status);
      console.log(`✓ Logged as ${status} in slot ${slot} for ${date}`);
    }
  } else if (nowFlag || planFlag) {
    // Save meal to library first (find or create), then log
    const id = await findOrCreateMeal(macros, category);
    const slot = slotOverride || await getNextEmptySlot(date);
    const status = nowFlag ? 'eating' : 'planned';
    await logMealSlot(date, slot, id, status);
    console.log(`\n✓ ${status === 'eating' ? 'Logging as currently eating' : 'Planned'}: "${macros.name}" in slot ${slot}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
