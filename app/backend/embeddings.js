const { Pool } = require('pg');
const OpenAI = require('openai');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

async function generateEmbedding(text) {
  const truncated = text.slice(0, 8000);
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncated,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

async function backfillEmbeddings() {
  const tables = ['journals', 'protocols', 'plans'];

  for (const table of tables) {
    const { rows } = await pool.query(
      `SELECT id, content FROM ${table} WHERE embedding IS NULL AND content IS NOT NULL ORDER BY created_at DESC`
    );

    if (rows.length === 0) {
      console.log(`${table}: all entries already have embeddings`);
      continue;
    }

    console.log(`${table}: ${rows.length} entries need embeddings`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const embedding = await generateEmbedding(row.content);
        const vectorStr = `[${embedding.join(',')}]`;
        await pool.query(
          `UPDATE ${table} SET embedding = $1 WHERE id = $2`,
          [vectorStr, row.id]
        );
        if ((i + 1) % 50 === 0 || i === rows.length - 1) {
          console.log(`  ${table}: ${i + 1}/${rows.length}`);
        }
      } catch (err) {
        console.error(`  Error on ${table} id=${row.id}: ${err.message}`);
      }
    }

    console.log(`${table}: done`);
  }

  await pool.end();
}

async function semanticSearch(query, options = {}) {
  const { type, table, limit = 10, threshold = 0.3 } = options;

  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(',')}]`;

  const tables = table ? [table] : ['journals', 'protocols', 'plans'];
  let allResults = [];

  for (const t of tables) {
    let sql, params;

    if (t === 'journals') {
      sql = `
        SELECT id, date, type, context, LEFT(content, 500) as snippet,
          1 - (embedding <=> $1::vector) as similarity
        FROM journals
        WHERE embedding IS NOT NULL
        ${type ? 'AND type = $2' : ''}
        ORDER BY embedding <=> $1::vector
        LIMIT $${type ? '3' : '2'}
      `;
      params = type ? [vectorStr, type, limit] : [vectorStr, limit];
    } else if (t === 'protocols') {
      sql = `
        SELECT id, title, category, LEFT(content, 500) as snippet,
          1 - (embedding <=> $1::vector) as similarity
        FROM protocols
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `;
      params = [vectorStr, limit];
    } else {
      sql = `
        SELECT id, title, status, context, LEFT(content, 500) as snippet,
          1 - (embedding <=> $1::vector) as similarity
        FROM plans
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `;
      params = [vectorStr, limit];
    }

    const { rows } = await pool.query(sql, params);
    allResults.push(...rows.map(r => ({ ...r, source_table: t })));
  }

  allResults = allResults
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return allResults;
}

module.exports = { generateEmbedding, backfillEmbeddings, semanticSearch, pool };

if (require.main === module) {
  backfillEmbeddings().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
