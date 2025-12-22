#!/usr/bin/env node
/**
 * Migrate Protocols to Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function migrateProtocols() {
  console.log('📐 Migrating Protocols to Supabase\n');
  
  const protocolsDir = path.join(__dirname, '..', '..', 'Protocols');
  
  if (!fs.existsSync(protocolsDir)) {
    console.log('ℹ️  No Protocols directory found, skipping\n');
    return;
  }
  
  const files = fs.readdirSync(protocolsDir).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} protocol files\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const file of files) {
    const filePath = path.join(protocolsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract title from filename or first heading
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1] : file.replace('.md', '');
    
    const id = `protocol-${file.replace('.md', '').toLowerCase().replace(/\s+/g, '-')}`;
    
    // Insert protocol
    const { data, error } = await supabase
      .from('protocols')
      .insert({
        id: id,
        title: title,
        content: content,
        category: 'general',
        file_path: file
        // embedding will be added later
      });
    
    if (error) {
      console.error(`❌ Error inserting protocol ${file}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Migrated: ${title}`);
      successCount++;
    }
  }
  
  console.log(`\n✅ Protocols migration complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}\n`);
}

migrateProtocols().catch(console.error);

