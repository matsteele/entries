#!/usr/bin/env node
/**
 * Supabase Journal CLI - Claude-friendly journaling with automatic embeddings
 * Usage: node scripts/journal-supabase.js <command> [args...]
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const crypto = require('crypto');
require('dotenv').config();

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Generate embedding for text
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('⚠️  Warning: Failed to generate embedding:', error.message);
    return null;
  }
}

// Auto-categorize entry by context
function categorizeContext(content) {
  const text = content.toLowerCase();
  
  // Keywords for each context
  const contexts = {
    projects: ['project', 'code', 'build', 'develop', 'feature', 'bug', 'refactor', 'deploy', 'commit'],
    professional: ['work', 'meeting', 'client', 'deadline', 'proposal', 'team', 'boss', 'job'],
    social: ['friend', 'family', 'party', 'visit', 'call', 'dinner', 'conversation', 'relationship'],
    personal: ['feel', 'think', 'reflect', 'realize', 'understand', 'grateful', 'happy', 'sad', 'anxious']
  };
  
  const scores = {};
  for (const [context, keywords] of Object.entries(contexts)) {
    scores[context] = keywords.filter(kw => text.includes(kw)).length;
  }
  
  // Return context with highest score, default to 'personal'
  const maxContext = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a);
  return maxContext[1] > 0 ? maxContext[0] : 'personal';
}

// Add journal entry with embedding
async function addEntry(content, options = {}) {
  console.log('\n📝 Adding journal entry to Supabase...');
  
  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0];
  
  // Auto-categorize if not provided
  const context = options.context || categorizeContext(content);
  
  // Generate embedding
  console.log('🤖 Generating AI embedding...');
  const embedding = await generateEmbedding(content);
  
  if (!embedding) {
    console.log('⚠️  Proceeding without embedding (can be added later)');
  }
  
  // Create journal entry
  const entry = {
    id: crypto.randomUUID(),
    date: date,
    content: content,
    context: context,
    type: options.type || 'contemplation',
    embedding: embedding,
    created_at: timestamp,
    updated_at: timestamp
  };
  
  // Insert into Supabase
  const { data, error } = await supabase
    .from('journals')
    .insert([entry])
    .select();
  
  if (error) {
    console.error('\n❌ Error adding entry:', error.message);
    process.exit(1);
  }
  
  console.log('\n✅ Journal entry added successfully!');
  console.log(`   ID: ${entry.id}`);
  console.log(`   Date: ${date}`);
  console.log(`   Context: ${context}`);
  console.log(`   Type: ${entry.type}`);
  console.log(`   Embedding: ${embedding ? '✓' : '✗'}`);
  console.log(`\n   "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"\n`);
  
  return data[0];
}

// Search journal entries semantically
async function searchEntries(query, options = {}) {
  console.log(`\n🔍 Searching for: "${query}"\n`);
  
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);
  
  if (!queryEmbedding) {
    console.error('❌ Failed to generate search embedding');
    process.exit(1);
  }
  
  // Call search function
  const { data, error } = await supabase
    .rpc('search_journals', {
      query_embedding: queryEmbedding,
      match_threshold: options.threshold || 0.7,
      match_count: options.limit || 5,
      filter_context: options.context || null,
      filter_type: options.type || null
    });
  
  if (error) {
    console.error('❌ Search error:', error.message);
    process.exit(1);
  }
  
  if (data.length === 0) {
    console.log('No results found. Try lowering the threshold or broadening your query.\n');
    return;
  }
  
  console.log(`Found ${data.length} results:\n`);
  console.log('='.repeat(80));
  
  data.forEach((entry, i) => {
    const similarity = (entry.similarity * 100).toFixed(1);
    console.log(`\n[${i + 1}] ${entry.date} | ${entry.context} | Similarity: ${similarity}%`);
    console.log('-'.repeat(80));
    console.log(entry.content);
    console.log('='.repeat(80));
  });
  
  console.log('');
}

// View recent entries
async function viewRecent(limit = 10, context = null) {
  console.log('\n📔 Recent journal entries:\n');
  
  let query = supabase
    .from('journals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (context) {
    query = query.eq('context', context);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('❌ Error fetching entries:', error.message);
    process.exit(1);
  }
  
  if (data.length === 0) {
    console.log('No entries found.\n');
    return;
  }
  
  console.log('='.repeat(80));
  
  data.forEach((entry, i) => {
    console.log(`\n[${i + 1}] ${entry.date} | ${entry.context} | ${entry.entry_type}`);
    console.log('-'.repeat(80));
    console.log(entry.content);
    console.log('='.repeat(80));
  });
  
  console.log(`\nShowing ${data.length} of ${data.length} entries\n`);
}

// Get entry by ID
async function getEntry(id) {
  const { data, error } = await supabase
    .from('journals')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error('❌ Error fetching entry:', error.message);
    process.exit(1);
  }
  
  console.log('\n📔 Journal Entry:\n');
  console.log('='.repeat(80));
  console.log(`ID: ${data.id}`);
  console.log(`Date: ${data.date}`);
  console.log(`Context: ${data.context}`);
  console.log(`Type: ${data.entry_type}`);
  console.log(`Created: ${data.created_at}`);
  console.log('='.repeat(80));
  console.log(data.content);
  console.log('='.repeat(80));
  console.log('');
}

// Show usage
function showUsage() {
  console.log(`
🤖 Supabase Journal CLI - Claude-Friendly Edition

Usage: node scripts/journal-supabase.js <command> [args...]

Commands:
  add "<content>" [--context <ctx>] [--type <type>]
      Add a new journal entry with automatic embedding
      Contexts: personal, social, professional, projects (auto-detected if not specified)
      Types: events, contemplation, plan, protocol (default: contemplation)

  search "<query>" [--limit <n>] [--threshold <n>] [--context <ctx>]
      Semantic search across all journal entries
      --limit: max results (default: 5)
      --threshold: similarity threshold 0-1 (default: 0.7)
      --context: filter by context

  recent [--limit <n>] [--context <ctx>]
      View recent journal entries
      --limit: number of entries (default: 10)
      --context: filter by context

  get <id>
      Get a specific entry by ID

Examples:
  # Add an entry (Claude can do this!)
  node scripts/journal-supabase.js add "Had a breakthrough with the embeddings system today. The semantic search is working beautifully."

  # Add with specific context
  node scripts/journal-supabase.js add "Shipped the new feature!" --context projects

  # Search semantically
  node scripts/journal-supabase.js search "times I felt productive"

  # View recent
  node scripts/journal-supabase.js recent --limit 5

  # View recent by context
  node scripts/journal-supabase.js recent --context projects

💡 For Claude to use:
   When the user asks you to journal something, use:
   node scripts/journal-supabase.js add "<their journal entry>"
`);
}

// Parse arguments
function parseArgs(args) {
  const options = {};
  const positional = [];
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      options[key] = value;
      i++; // skip next arg
    } else {
      positional.push(args[i]);
    }
  }
  
  return { options, positional };
}

// Main
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  try {
    switch (command) {
      case 'add': {
        const { options, positional } = parseArgs(args);
        if (positional.length < 1) {
          console.error('\n❌ Usage: add "<content>" [--context <ctx>] [--type <type>]\n');
          process.exit(1);
        }
        const content = positional.join(' ');
        await addEntry(content, options);
        break;
      }
      
      case 'search': {
        const { options, positional } = parseArgs(args);
        if (positional.length < 1) {
          console.error('\n❌ Usage: search "<query>" [--limit <n>] [--threshold <n>]\n');
          process.exit(1);
        }
        const query = positional.join(' ');
        await searchEntries(query, {
          limit: options.limit ? parseInt(options.limit) : 5,
          threshold: options.threshold ? parseFloat(options.threshold) : 0.7,
          context: options.context
        });
        break;
      }
      
      case 'recent': {
        const { options } = parseArgs(args);
        const limit = options.limit ? parseInt(options.limit) : 10;
        await viewRecent(limit, options.context);
        break;
      }
      
      case 'get': {
        if (args.length < 1) {
          console.error('\n❌ Usage: get <id>\n');
          process.exit(1);
        }
        await getEntry(args[0]);
        break;
      }
      
      default:
        showUsage();
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

