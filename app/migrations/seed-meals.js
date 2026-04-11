#!/usr/bin/env node
// Seed reference meals into the meals table
// Run: node app/migrations/seed-meals.js

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MEALS = [
  // Breakfast
  { name: 'Greek Yogurt + Berries', category: 'breakfast', ingredients: ['Greek yogurt (200g)', 'mixed berries', 'granola'], recipe: 'Layer yogurt, top with berries and granola.', protein: 20, carbs: 35, fat: 4, calories: 260 },
  { name: 'Omelette (3 eggs)', category: 'breakfast', ingredients: ['3 eggs', 'spinach', 'cheese', 'olive oil'], recipe: 'Whisk eggs, cook in oiled pan, add fillings, fold.', protein: 24, carbs: 2, fat: 18, calories: 270 },
  { name: 'Overnight Oats', category: 'breakfast', ingredients: ['oats (80g)', 'almond milk', 'chia seeds', 'banana'], recipe: 'Mix oats, milk, chia seeds. Refrigerate overnight. Top with banana.', protein: 12, carbs: 55, fat: 7, calories: 335 },
  { name: 'Protein Shake', category: 'breakfast', ingredients: ['whey protein (1 scoop)', 'almond milk', 'banana', 'peanut butter'], recipe: 'Blend all ingredients.', protein: 35, carbs: 35, fat: 10, calories: 370 },
  { name: 'Avocado Toast + Eggs', category: 'breakfast', ingredients: ['sourdough (2 slices)', 'avocado', '2 eggs', 'salt', 'red pepper flakes'], recipe: 'Toast bread, mash avocado on top, add poached or fried eggs.', protein: 22, carbs: 38, fat: 20, calories: 420 },

  // Lunch
  { name: 'Chicken Salad', category: 'lunch', ingredients: ['grilled chicken breast (200g)', 'mixed greens', 'cherry tomatoes', 'cucumber', 'olive oil', 'lemon'], recipe: 'Grill chicken, slice. Toss with greens and veggies. Dress with olive oil and lemon.', protein: 45, carbs: 10, fat: 12, calories: 330 },
  { name: 'Tuna Rice Bowl', category: 'lunch', ingredients: ['canned tuna (150g)', 'brown rice (150g cooked)', 'edamame', 'soy sauce', 'sesame oil'], recipe: 'Cook rice. Top with tuna, edamame. Drizzle soy sauce and sesame oil.', protein: 40, carbs: 45, fat: 8, calories: 415 },
  { name: 'Turkey Wrap', category: 'lunch', ingredients: ['turkey breast (150g)', 'whole wheat wrap', 'lettuce', 'tomato', 'hummus'], recipe: 'Spread hummus on wrap. Layer turkey, lettuce, tomato. Roll tightly.', protein: 38, carbs: 30, fat: 10, calories: 365 },
  { name: 'Lentil Soup', category: 'lunch', ingredients: ['red lentils (150g)', 'carrots', 'celery', 'onion', 'cumin', 'vegetable broth'], recipe: 'Sauté veg, add lentils and broth. Simmer 25 min. Season with cumin.', protein: 18, carbs: 45, fat: 3, calories: 280 },
  { name: 'Salmon + Quinoa', category: 'lunch', ingredients: ['salmon fillet (200g)', 'quinoa (150g cooked)', 'broccoli', 'lemon', 'olive oil'], recipe: 'Season salmon, bake at 400°F 12 min. Serve over quinoa with steamed broccoli.', protein: 50, carbs: 35, fat: 22, calories: 540 },

  // Dinner
  { name: 'Chicken Stir Fry', category: 'dinner', ingredients: ['chicken breast (200g)', 'mixed veg', 'soy sauce', 'garlic', 'ginger', 'brown rice'], recipe: 'Cook chicken in wok with garlic/ginger. Add veg and sauce. Serve over rice.', protein: 45, carbs: 40, fat: 10, calories: 435 },
  { name: 'Beef + Sweet Potato', category: 'dinner', ingredients: ['lean beef (200g)', 'sweet potato (200g)', 'asparagus', 'olive oil', 'garlic'], recipe: 'Roast sweet potato 30 min. Sear beef 4 min each side. Steam asparagus.', protein: 48, carbs: 40, fat: 15, calories: 490 },
  { name: 'Pasta Bolognese', category: 'dinner', ingredients: ['lean mince (150g)', 'pasta (100g dry)', 'tomato sauce', 'onion', 'garlic', 'parmesan'], recipe: 'Brown mince with onion and garlic. Add tomato sauce, simmer 20 min. Toss with cooked pasta.', protein: 40, carbs: 75, fat: 14, calories: 580 },
  { name: 'Grilled Cod + Veg', category: 'dinner', ingredients: ['cod fillet (250g)', 'zucchini', 'peppers', 'olive oil', 'herbs'], recipe: 'Brush cod with oil and herbs. Grill 5 min each side. Roast veg at 400°F 20 min.', protein: 50, carbs: 15, fat: 10, calories: 355 },
  { name: 'Chicken Curry', category: 'dinner', ingredients: ['chicken thighs (250g)', 'coconut milk', 'curry paste', 'tomatoes', 'basmati rice'], recipe: 'Brown chicken. Add curry paste, coconut milk, tomatoes. Simmer 20 min. Serve with rice.', protein: 42, carbs: 45, fat: 20, calories: 530 },

  // Snacks
  { name: 'Apple + Almond Butter', category: 'snack', ingredients: ['apple', 'almond butter (2 tbsp)'], recipe: 'Slice apple. Serve with almond butter for dipping.', protein: 5, carbs: 30, fat: 14, calories: 265 },
  { name: 'Cottage Cheese + Fruit', category: 'snack', ingredients: ['cottage cheese (200g)', 'pineapple chunks'], recipe: 'Top cottage cheese with pineapple.', protein: 22, carbs: 20, fat: 4, calories: 205 },
  { name: 'Mixed Nuts', category: 'snack', ingredients: ['mixed nuts (40g)'], recipe: 'Portion 40g mixed nuts.', protein: 7, carbs: 8, fat: 22, calories: 255 },
  { name: 'Protein Bar', category: 'snack', ingredients: ['protein bar'], recipe: 'Ready to eat.', protein: 20, carbs: 25, fat: 8, calories: 245 },
  { name: 'Rice Cakes + Hummus', category: 'snack', ingredients: ['rice cakes (3)', 'hummus (4 tbsp)'], recipe: 'Top rice cakes with hummus.', protein: 6, carbs: 30, fat: 6, calories: 198 },
  { name: 'Hard Boiled Eggs', category: 'snack', ingredients: ['2 hard boiled eggs', 'salt'], recipe: 'Boil eggs 10 min. Cool, peel, salt.', protein: 12, carbs: 1, fat: 10, calories: 145 },

  // Meal prep / combo
  { name: 'Meal Prep Chicken + Rice', category: 'lunch', ingredients: ['chicken breast (200g)', 'white rice (200g cooked)', 'steamed broccoli', 'soy sauce'], recipe: 'Batch cook chicken, rice, and broccoli. Season with soy sauce.', protein: 50, carbs: 50, fat: 8, calories: 475 },
  { name: 'Smoothie Bowl', category: 'breakfast', ingredients: ['frozen banana', 'frozen berries', 'protein powder', 'almond milk', 'granola', 'seeds'], recipe: 'Blend frozen fruit with protein powder and milk (thick). Top with granola and seeds.', protein: 28, carbs: 55, fat: 8, calories: 405 },
];

async function main() {
  let inserted = 0;
  for (const meal of MEALS) {
    const result = await pool.query(
      `INSERT INTO meals (name, category, ingredients, recipe, protein, carbs, fat, calories)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING RETURNING id`,
      [meal.name, meal.category, meal.ingredients, meal.recipe,
       meal.protein, meal.carbs, meal.fat, meal.calories]
    );
    if (result.rows[0]) inserted++;
  }
  console.log(`✅ Seeded ${inserted} meals (${MEALS.length - inserted} already existed)`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
