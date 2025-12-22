#!/usr/bin/env node
/**
 * Migrate Journal Entries to Supabase
 * Step 1: Migrate without embeddings (we'll add those later)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function migrateJournals() {
  console.log('📦 Migrating Journal Entries to Supabase\n');
  
  // Load journal entries
  const entriesPath = path.join(__dirname, '..', '..', 'journal', 'data', 'journal_entries.json');
  const metadataPath = path.join(__dirname, '..', '..', 'journal', 'data', 'journal_metadata.json');
  const dailyLogsPath = path.join(__dirname, '..', '..', 'journal', 'data', 'daily_logs.json');
  
  const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const dailyLogs = JSON.parse(fs.readFileSync(dailyLogsPath, 'utf8'));
  
  console.log(`Found ${entries.length} journal entries`);
  console.log(`Found ${dailyLogs.logs.length} daily log entries\n`);
  
  // Merge daily logs into entries format
  const dailyLogEntries = dailyLogs.logs.map(log => ({
    id: log.id,
    date: log.date,
    content: log.content
  }));
  
  const allEntries = [...entries, ...dailyLogEntries];
  console.log(`Total entries to migrate: ${allEntries.length}\n`);
  
  // Migrate in batches
  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < allEntries.length; i += batchSize) {
    const batch = allEntries.slice(i, i + batchSize);
    
    // Transform entries for Supabase
    const journalsToInsert = batch.map(entry => {
      const meta = metadata[entry.id] || {};
      
      return {
        id: entry.id,
        date: entry.date,
        content: entry.content,
        type: entry.id.startsWith('log-') ? 'quick' : 'entry',
        context: inferContext(entry.content, meta), // We'll categorize based on content
        summary: meta.summary || null,
        word_count: meta.word_count || entry.content.split(/\s+/).length,
        // embedding will be null for now, we'll add it in step 2
      };
    });
    
    // Insert batch
    const { data, error } = await supabase
      .from('journals')
      .insert(journalsToInsert);
    
    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      console.log(`✅ Migrated batch ${i / batchSize + 1}: ${successCount}/${allEntries.length} entries`);
    }
    
    // Also insert metadata
    const metadataToInsert = batch
      .filter(entry => metadata[entry.id])
      .map(entry => ({
        journal_id: entry.id,
        people: metadata[entry.id].people || [],
        emotions: metadata[entry.id].emotions || [],
        concepts: metadata[entry.id].concepts || [],
        key_insights: metadata[entry.id].key_insights || []
      }));
    
    if (metadataToInsert.length > 0) {
      await supabase
        .from('journal_metadata')
        .insert(metadataToInsert);
    }
  }
  
  console.log(`\n✅ Migration complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`\nℹ️  Next step: Generate embeddings with OpenAI\n`);
}

// Simple context inference based on content keywords
function inferContext(content, meta) {
  const contentLower = content.toLowerCase();
  const concepts = meta.concepts || [];
  
  // Check concepts first
  if (concepts.includes('work') || concepts.includes('productivity') || concepts.includes('creativity')) {
    return 'professional';
  }
  if (concepts.includes('relationships') || concepts.includes('social')) {
    return 'social';
  }
  
  // Check content keywords
  if (contentLower.includes('project') || contentLower.includes('code') || contentLower.includes('work')) {
    return 'projects';
  }
  if (contentLower.includes('friend') || contentLower.includes('date') || contentLower.includes('met')) {
    return 'social';
  }
  
  // Default to personal
  return 'personal';
}

migrateJournals().catch(console.error);

