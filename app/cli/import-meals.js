const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MEALS = [
  // Breakfast
  { name: 'Overnight oats with coconut water, blueberries, raisins and nuts', category: 'breakfast', calories: 445, protein: 31, fat: 18, carbs: 65, ingredients: ['oats','coconut water','blueberries','raisins','mixed nuts','salt'] },
  { name: 'Scrambled eggs with spinach, mushrooms, zucchini and avocado toast', category: 'breakfast', calories: 452, protein: 22, fat: 31, carbs: 31, ingredients: ['eggs','spinach','mushrooms','zucchini','cherry tomatoes','avocado','bread'] },
  { name: 'Healthy French toast', category: 'breakfast', calories: 585, protein: 26, fat: 35, carbs: 55, ingredients: ['bread','eggs','milk','cinnamon','vanilla extract','honey'] },
  { name: 'Kale OJ smoothie with protein, banana, brazil nuts and avocado', category: 'breakfast', calories: 480, protein: 35, fat: 18, carbs: 52, ingredients: ['kale','orange juice','protein powder','banana','brazil nuts','avocado'] },
  { name: 'Oat pancakes', category: 'breakfast', calories: 420, protein: 18, fat: 12, carbs: 60, ingredients: ['oats','eggs','banana','baking powder'] },
  // Lunch
  { name: 'Apple, chicken, avocado, mozzarella balsamic spinach and arugula salad', category: 'lunch', calories: 480, protein: 38, fat: 22, carbs: 28, ingredients: ['chicken breast','apple','avocado','mozzarella','spinach','arugula','cranberries','balsamic vinegar'] },
  { name: 'Spinach, egg and mushroom egg wrap', category: 'lunch', calories: 380, protein: 28, fat: 18, carbs: 28, ingredients: ['eggs','spinach','mushrooms','tortilla'] },
  { name: "TJ's lentil soup with chicken and mozzarella", category: 'lunch', calories: 420, protein: 35, fat: 12, carbs: 42, ingredients: ["TJ's lentil soup",'chicken breast','mozzarella'] },
  { name: 'Harvest chili with avocado, sardines and mozzarella', category: 'lunch', calories: 460, protein: 36, fat: 20, carbs: 38, ingredients: ['harvest chili','avocado','sardines','mozzarella'] },
  { name: 'Glass garden vegetable soup with chicken and toast', category: 'lunch', calories: 380, protein: 32, fat: 10, carbs: 40, ingredients: ['vegetable soup','chicken breast','bread'] },
  { name: 'Broccoli chicken salad', category: 'lunch', calories: 340, protein: 36, fat: 14, carbs: 16, ingredients: ['broccoli','chicken breast','olive oil','lemon'] },
  { name: 'Zucchini and ground beef with cilantro', category: 'lunch', calories: 400, protein: 34, fat: 22, carbs: 14, ingredients: ['zucchini','ground beef','cilantro','garlic','olive oil'] },
  { name: 'Steamed broccoli with mozzarella and chicken', category: 'lunch', calories: 360, protein: 38, fat: 14, carbs: 14, ingredients: ['broccoli','mozzarella','chicken breast'] },
  { name: 'Massaged kale salad with pine nuts, goat cheese and chicken', category: 'lunch', calories: 420, protein: 36, fat: 22, carbs: 18, ingredients: ['kale','pine nuts','goat cheese','chicken breast','lemon','olive oil'] },
  { name: 'Roasted beets with shallots and baked kale', category: 'lunch', calories: 280, protein: 8, fat: 10, carbs: 42, ingredients: ['beets','shallots','kale','olive oil'] },
  { name: 'Pumpkin curry soup with chicken', category: 'lunch', calories: 380, protein: 30, fat: 14, carbs: 36, ingredients: ['pumpkin curry soup','chicken breast'] },
  { name: 'Minestrone soup with chicken', category: 'lunch', calories: 360, protein: 28, fat: 10, carbs: 42, ingredients: ['minestrone soup','chicken breast'] },
  // Dinner
  { name: 'Asparagus, quinoa and grilled chicken', category: 'dinner', calories: 480, protein: 42, fat: 12, carbs: 48, ingredients: ['asparagus','quinoa','chicken breast','olive oil','lemon'] },
  { name: 'Grilled steak on mashed sweet potatoes and green beans', category: 'dinner', calories: 560, protein: 44, fat: 22, carbs: 42, ingredients: ['steak','sweet potatoes','green beans','butter','garlic'] },
  { name: 'Fried cabbage and kale with balsamic', category: 'dinner', calories: 280, protein: 8, fat: 14, carbs: 30, ingredients: ['cabbage','kale','balsamic vinegar','olive oil','garlic'] },
  { name: 'Salmon burgers wrapped in hummus lettuce', category: 'dinner', calories: 440, protein: 38, fat: 22, carbs: 20, ingredients: ['salmon burgers','hummus','lettuce','tomato'] },
  { name: 'Chicken on massaged kale salad', category: 'dinner', calories: 400, protein: 40, fat: 16, carbs: 18, ingredients: ['chicken breast','kale','lemon','olive oil','garlic'] },
  { name: 'Salmon and asparagus foil packs with garlic lemon butter', category: 'dinner', calories: 480, protein: 42, fat: 24, carbs: 14, ingredients: ['salmon','asparagus','butter','garlic','lemon','paprika','parsley'] },
  { name: 'Garlic lime chicken tenders and quinoa', category: 'dinner', calories: 500, protein: 44, fat: 14, carbs: 48, ingredients: ['chicken tenders','quinoa','garlic','lime','olive oil'] },
  { name: 'Creamy Tuscan salmon', category: 'dinner', calories: 520, protein: 40, fat: 32, carbs: 14, ingredients: ['salmon','olive oil','butter','garlic','onion','sun-dried tomatoes','heavy cream','spinach','parmesan','parsley'] },
  { name: 'Lemon garlic butter steak with zucchini noodles', category: 'dinner', calories: 520, protein: 44, fat: 28, carbs: 16, ingredients: ['steak','zucchini','butter','garlic','lemon','olive oil'] },
  // Snacks
  { name: 'Protein shake', category: 'snack', calories: 200, protein: 30, fat: 4, carbs: 16, ingredients: ['protein powder','water or milk'] },
  { name: 'Chia pudding with frozen berries', category: 'snack', calories: 220, protein: 8, fat: 10, carbs: 28, ingredients: ['chia seeds','almond milk','mixed berries','honey'] },
  { name: 'Greek yogurt with blueberries', category: 'snack', calories: 180, protein: 18, fat: 4, carbs: 22, ingredients: ['greek yogurt','blueberries'] },
  { name: 'BCAAs', category: 'snack', calories: 20, protein: 5, fat: 0, carbs: 0, ingredients: ['BCAAs'] },
];

async function main() {
  let inserted = 0, skipped = 0;
  for (const m of MEALS) {
    const existing = await pool.query('SELECT id FROM meals WHERE LOWER(name) = LOWER($1)', [m.name]);
    if (existing.rows.length) { skipped++; continue; }
    await pool.query(
      `INSERT INTO meals (name, category, ingredients, protein, carbs, fat, calories)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m.name, m.category, m.ingredients, m.protein, m.carbs, m.fat, m.calories]
    );
    inserted++;
  }
  console.log(`Done: ${inserted} inserted, ${skipped} skipped`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
