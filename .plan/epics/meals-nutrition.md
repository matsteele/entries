# PRD: Meals & Nutrition (E5 — Remaining)

**Epic ID:** `536affe8-80bb-4a50-aabf-4880ee47f632`  
**Priority:** P4 W:8  
**Status:** Active (partial)  
**Planning IDs:** Epic `536affe8`, Project `proj-life-system`, Goal `goal-life-infrastructure`

**Already built:** Meal library, 5-slot daily plan, fasting window, grocery list generation.  
**This PRD covers:** remaining items — delete/add meals from the menu, and composable meals.

---

## Feature 1: Delete and Add Meals from the Menu

### Problem

The meal library (managed via `/meals` CLI or the MealsView meal picker drawer) has no in-UI way to:
- Delete a meal from the library
- Add a new meal directly from the meal picker (you have to use the CLI `/meals "name" -reg`)

This is friction when you want to clean up the library or add a meal mid-planning session.

### User Stories

**Delete a meal from the library:**
> As a user, I want to remove a meal from my library that I no longer eat, so my picker stays clean.

Acceptance criteria:
- In the meal picker drawer (MealsView), each meal row has a delete icon (trash, visible on hover)
- Clicking delete shows brief confirmation ("Remove Scrambled eggs from library?")
- On confirm: `DELETE /api/meals/:id` removes from the `meals` table
- Any `meal_plans` rows referencing the deleted meal are set to `meal_id = NULL` (or deleted — TBD, see edge cases)
- Meal disappears from picker immediately (optimistic update)

**Add a new meal from the UI:**
> As a user, I want to add a new meal to my library from within the dashboard, so I don't have to use the CLI.

Acceptance criteria:
- "Add meal" button at the bottom of the meal picker drawer (or in a Library tab)
- Opens a form: name (required), category (dropdown), protein/carbs/fat/calories (optional), ingredients (optional)
- On submit: `POST /api/meals` saves to `meals` table
- New meal appears in picker immediately
- Basic macro auto-estimation from name via GPT (optional, stretch — same as CLI does it)

### API changes needed

- `DELETE /api/meals/:id` — remove a meal (soft-delete or hard delete, mark with `deleted_at`)
- `POST /api/meals` — already exists, ensure it returns the created meal

### Edge cases

- Meal referenced in a future `meal_plans` slot: when deleted, the slot becomes empty (clear `meal_id`). Don't block deletion.
- Meal referenced in past slots: leave historical data intact. Only nullify future/today slots.

---

## Feature 2: Composable Meals

### Problem

Most meals in the library are fixed combinations (e.g., "Scrambled eggs with spinach, mushrooms, zucchini and avocado toast"). In practice, the user builds meals from a set of base ingredients that recombine:

- Eggs + spinach + mushrooms
- Eggs + avocado toast
- Ground beef + rice
- Ground beef + sweet potato

The current model treats each combination as a separate meal entry, leading to library bloat and macro inaccuracy when you substitute an ingredient.

### Concept

**Ingredients** are the atomic unit. **Meals** are compositions of ingredients with optional quantities. When planning a meal, you pick a base (e.g., "Ground beef") and add ingredients (e.g., "+ rice", "+ broccoli"). Macros are calculated from the sum of chosen ingredients.

This is closer to how the user actually cooks.

### User Stories

**Build a meal from ingredients:**
> As a user, I want to pick a protein + carb + vegetable and have the macros calculated automatically, so I don't need a separate entry for every combination.

Acceptance criteria:
- Meal picker has a "Build" tab alongside "Browse"
- Build tab shows ingredient categories: Protein, Carb, Fat, Vegetable, Misc
- User selects one or more items from each category
- Macro totals update live as ingredients are added/removed
- "Log this" saves the combination as a one-off meal plan entry (not added to library unless user requests it)
- Optional: "Save as meal" prompt to save the combination with a name

**Create an ingredient:**
> As a user, I want to add an ingredient to the ingredient library with its macros per 100g/serving, so I can use it in compositions.

Acceptance criteria:
- `/meals register-ingredient "ingredient" [macros]` CLI command
- Or via "Add ingredient" in the Build tab
- Ingredient has: name, category, protein/carbs/fat/calories per serving, serving size (g or unit)

### Data Model

#### New table: `ingredients`

```sql
CREATE TABLE ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT,            -- 'protein' | 'carb' | 'fat' | 'vegetable' | 'misc'
  protein  NUMERIC,         -- per serving
  carbs    NUMERIC,
  fat      NUMERIC,
  calories NUMERIC,
  serving_size NUMERIC,     -- grams
  serving_unit TEXT DEFAULT 'g',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### New table: `meal_ingredients`

```sql
CREATE TABLE meal_ingredients (
  meal_id     UUID REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity    NUMERIC DEFAULT 1,  -- multiplier on serving size
  PRIMARY KEY (meal_id, ingredient_id)
);
```

#### Updated `meals` table

Existing `meals.ingredients TEXT[]` column becomes soft-deprecated (keep for display). New column:
```sql
ALTER TABLE meals ADD COLUMN is_composable BOOLEAN DEFAULT FALSE;
```

When a meal is built from the Build tab, it's either:
- **Ad-hoc** (not saved to library): macro sum stored directly on the `meal_plans` row as `macros_override JSONB`
- **Saved** (added to library): saved as a new `meals` row with `is_composable = true` and `meal_ingredients` rows

#### `meal_plans` macro override

```sql
ALTER TABLE meal_plans ADD COLUMN macros_override JSONB;
-- e.g. { "protein": 42, "carbs": 30, "fat": 18, "calories": 450, "label": "Ground beef + rice" }
```

When macro_override is set, the macro totals bar uses it instead of the linked `meals` row macros.

### API changes needed

```
GET  /api/ingredients              → list all ingredients grouped by category
POST /api/ingredients              → create ingredient
GET  /api/meals/build-preview      → POST body: [{ingredientId, qty}], returns macro totals
POST /api/meal-plans/:date/build   → save a built meal to a slot (with macros_override)
```

### UI: Build Tab in Meal Picker

```
┌─────────────────────────────────────────────────────────┐
│  Browse | Build                                           │
├─────────────────────────────────────────────────────────┤
│  PROTEIN                                                   │
│  [ ] Ground beef (200g)   26g P | 0g C | 14g F | 226kcal │
│  [✓] Chicken breast       31g P | 0g C | 3g F  | 165kcal │
│  [ ] Eggs (2)             12g P | 1g C | 9g F  | 143kcal │
│                                                           │
│  CARB                                                     │
│  [✓] White rice (1 cup)   4g P | 45g C | 0g F | 206kcal  │
│  [ ] Sweet potato          2g P | 20g C | 0g F | 86kcal  │
│                                                           │
│  ─────────────────────────────────────────────────────── │
│  Total: 35g P | 45g C | 3g F | 371 kcal                  │
│  [Save as meal]                  [Log this]               │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Order

### Phase 1: Delete/Add from UI (simpler, higher impact)
1. `DELETE /api/meals/:id` route
2. Delete icon + confirmation in meal picker drawer
3. "Add meal" button + form in meal picker drawer

### Phase 2: Composable Meals
1. DB migration: `ingredients` table + `meal_ingredients` join + `meal_plans.macros_override`
2. Seed initial ingredients from existing meal library (extract common ingredients)
3. `GET /api/ingredients` + `POST /api/ingredients` + macro preview endpoint
4. Build tab in meal picker drawer
5. `POST /api/meal-plans/:date/build` to save a built composition to a slot
6. "Save as meal" flow to persist named compositions to the library
