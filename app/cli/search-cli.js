const { semanticSearch, pool } = require('../backend/embeddings');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node search-cli.js "query" [--type TYPE] [--table TABLE] [--limit N]');
    console.log('  --type    Filter journals by type (entry, contemplation, protocol, plan, events, quick)');
    console.log('  --table   Search specific table (journals, protocols, plans)');
    console.log('  --limit   Max results (default: 10)');
    process.exit(0);
  }

  const query = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) options.type = args[++i];
    if (args[i] === '--table' && args[i + 1]) options.table = args[++i];
    if (args[i] === '--limit' && args[i + 1]) options.limit = parseInt(args[++i]);
  }

  console.log(`Searching for: "${query}"\n`);

  const results = await semanticSearch(query, options);

  if (results.length === 0) {
    console.log('No results found.');
  } else {
    for (const r of results) {
      const sim = (r.similarity * 100).toFixed(1);
      const header = r.source_table === 'journals'
        ? `[${r.type}] ${r.date} (${r.context || 'no context'})`
        : `[${r.source_table}] ${r.title || r.id}`;

      console.log(`--- ${sim}% match | ${header} ---`);
      console.log(`ID: ${r.id}`);
      console.log(r.snippet);
      console.log();
    }
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
