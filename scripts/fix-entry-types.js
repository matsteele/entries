#!/usr/bin/env node
/**
 * Fix entry types in Supabase journals table
 * Change: daily-log → events, reflection → contemplation, note → plan or protocol
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Mapping of content patterns to correct types
const typeMapping = {
  // Events - start with location/event descriptions
  'Trip to Cairo': 'events',
  'Current Health Issues': 'events',
  'Recent Financial Trading': 'events',

  // Contemplations - start with "Contemplation:"
  'Contemplation:': 'contemplation',

  // Plans - start with "Plan:"
  'Plan:': 'plan',

  // Protocols - start with "Protocol:"
  'Protocol:': 'protocol'
};

async function fixTypes() {
  console.log('\n🔧 Fixing entry types in journals table...\n');

  // Get all entries from today
  const { data: entries, error: fetchError } = await supabase
    .from('journals')
    .select('*')
    .eq('date', '2025-11-18')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('❌ Error fetching entries:', fetchError.message);
    process.exit(1);
  }

  console.log(`Found ${entries.length} entries to check\n`);

  let updated = 0;

  for (const entry of entries) {
    let newType = null;

    // Determine correct type based on content
    for (const [pattern, type] of Object.entries(typeMapping)) {
      if (entry.content.startsWith(pattern)) {
        newType = type;
        break;
      }
    }

    if (!newType) {
      console.log(`⚠️  Could not determine type for entry: ${entry.id}`);
      console.log(`   Content starts with: ${entry.content.substring(0, 50)}...\n`);
      continue;
    }

    // Update if type is different
    if (entry.type !== newType) {
      const { error: updateError } = await supabase
        .from('journals')
        .update({ type: newType })
        .eq('id', entry.id);

      if (updateError) {
        console.error(`❌ Error updating entry ${entry.id}:`, updateError.message);
      } else {
        console.log(`✅ Updated ${entry.id}: ${entry.type || 'undefined'} → ${newType}`);
        updated++;
      }
    } else {
      console.log(`✓ ${entry.id}: Already correct type (${newType})`);
    }
  }

  console.log(`\n✅ Updated ${updated} entries\n`);
}

fixTypes();
