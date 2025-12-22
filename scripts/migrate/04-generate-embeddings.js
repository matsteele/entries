#!/usr/bin/env node
/**
 * Generate OpenAI Embeddings for All Content
 * Step 4: Add vector embeddings to journals, plans, and protocols
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Rate limiting: OpenAI has limits, so we'll batch with delays
const BATCH_SIZE = 100; // Process 100 at a time
const DELAY_MS = 1000; // 1 second delay between batches

async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
}

async function updateJournalEmbeddings() {
  console.log('\n📝 Processing journal entries...');
  
  // Get all journals without embeddings
  const { data: journals, error } = await supabase
    .from('journals')
    .select('id, content')
    .is('embedding', null);
  
  if (error) {
    console.error('Error fetching journals:', error);
    return;
  }
  
  console.log(`Found ${journals.length} journals without embeddings`);
  
  let processed = 0;
  const batches = Math.ceil(journals.length / BATCH_SIZE);
  
  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, journals.length);
    const batch = journals.slice(start, end);
    
    console.log(`\nProcessing batch ${i + 1}/${batches} (${start + 1}-${end}/${journals.length})`);
    
    for (const journal of batch) {
      try {
        const embedding = await generateEmbedding(journal.content);
        
        const { error: updateError } = await supabase
          .from('journals')
          .update({ embedding })
          .eq('id', journal.id);
        
        if (updateError) {
          console.error(`  ❌ Failed to update journal ${journal.id}:`, updateError.message);
        } else {
          processed++;
          process.stdout.write(`  ✓ ${processed}/${journals.length}\r`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing journal ${journal.id}:`, error.message);
      }
    }
    
    // Delay between batches to respect rate limits
    if (i < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  
  console.log(`\n✅ Completed ${processed}/${journals.length} journal embeddings`);
}

async function updatePlanEmbeddings() {
  console.log('\n📋 Processing plans...');
  
  const { data: plans, error } = await supabase
    .from('plans')
    .select('id, title, content, goals')
    .is('embedding', null);
  
  if (error) {
    console.error('Error fetching plans:', error);
    return;
  }
  
  console.log(`Found ${plans.length} plans without embeddings`);
  
  let processed = 0;
  
  for (const plan of plans) {
    try {
      // Combine title, goals, and content for embedding
      const textToEmbed = [
        plan.title,
        plan.goals ? plan.goals.join(' ') : '',
        plan.content
      ].join('\n\n');
      
      const embedding = await generateEmbedding(textToEmbed);
      
      const { error: updateError } = await supabase
        .from('plans')
        .update({ embedding })
        .eq('id', plan.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update plan ${plan.id}:`, updateError.message);
      } else {
        processed++;
        console.log(`  ✓ ${processed}/${plans.length} - ${plan.title}`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing plan ${plan.id}:`, error.message);
    }
    
    // Small delay between each plan
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`✅ Completed ${processed}/${plans.length} plan embeddings`);
}

async function updateProtocolEmbeddings() {
  console.log('\n📖 Processing protocols...');
  
  const { data: protocols, error } = await supabase
    .from('protocols')
    .select('id, title, content')
    .is('embedding', null);
  
  if (error) {
    console.error('Error fetching protocols:', error);
    return;
  }
  
  console.log(`Found ${protocols.length} protocols without embeddings`);
  
  let processed = 0;
  
  for (const protocol of protocols) {
    try {
      // Combine title and content for embedding
      const textToEmbed = `${protocol.title}\n\n${protocol.content}`;
      
      const embedding = await generateEmbedding(textToEmbed);
      
      const { error: updateError } = await supabase
        .from('protocols')
        .update({ embedding })
        .eq('id', protocol.id);
      
      if (updateError) {
        console.error(`  ❌ Failed to update protocol ${protocol.id}:`, updateError.message);
      } else {
        processed++;
        console.log(`  ✓ ${processed}/${protocols.length} - ${protocol.title}`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing protocol ${protocol.id}:`, error.message);
    }
    
    // Small delay between each protocol
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`✅ Completed ${processed}/${protocols.length} protocol embeddings`);
}

async function main() {
  console.log('🚀 OpenAI Embeddings Generator\n');
  console.log('Model: text-embedding-3-small (1536 dimensions)');
  
  // Verify OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in .env file');
    console.error('Please add: OPENAI_API_KEY=sk-...');
    process.exit(1);
  }
  
  const startTime = Date.now();
  
  try {
    // Generate embeddings for all content types
    await updateJournalEmbeddings();
    await updatePlanEmbeddings();
    await updateProtocolEmbeddings();
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    console.log(`\n✨ All embeddings generated successfully!`);
    console.log(`⏱️  Total time: ${duration} minutes`);
    console.log(`\n💡 Next: Test semantic search with:`);
    console.log(`   node scripts/test-search.js "your search query"`);
    
  } catch (error) {
    console.error('\n❌ Error during embedding generation:', error);
    process.exit(1);
  }
}

main();

