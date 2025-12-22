#!/usr/bin/env node
/**
 * Migrate Plans to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function migratePlans() {
  console.log('📋 Migrating Plans to Supabase\n');
  
  // Load plans
  const plansPath = path.join(__dirname, '..', '..', 'plans', 'data', 'plans.json');
  const plansDir = path.join(__dirname, '..', '..', 'plans', 'active');
  
  const plansData = JSON.parse(fs.readFileSync(plansPath, 'utf8'));
  console.log(`Found ${plansData.plans.length} plans\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const plan of plansData.plans) {
    // Read plan content from file
    const planFilePath = path.join(plansDir, plan.file);
    let content = '';
    
    if (fs.existsSync(planFilePath)) {
      content = fs.readFileSync(planFilePath, 'utf8');
    } else {
      console.warn(`⚠️  Plan file not found: ${plan.file}`);
      content = `# ${plan.title}\n\nContent not found.`;
    }
    
    // Insert plan
    const { data, error } = await supabase
      .from('plans')
      .insert({
        id: plan.id,
        title: plan.title,
        type: plan.type,
        status: plan.status,
        context_id: plan.context_id,
        objective_id: plan.objective_id,
        project_id: plan.project_id,
        content: content,
        file_path: plan.file,
        created_at: plan.created,
        updated_at: plan.updated,
        tags: plan.tags || []
        // embedding will be added later
      });
    
    if (error) {
      console.error(`❌ Error inserting plan ${plan.id}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Migrated: ${plan.title}`);
      successCount++;
    }
  }
  
  console.log(`\n✅ Plans migration complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

migratePlans().catch(console.error);

