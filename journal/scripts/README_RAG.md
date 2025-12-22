# Journal - RAG-Optimized Structure

A RAG (Retrieval-Augmented Generation) optimized journal system with separated content and metadata for efficient search and retrieval.

## Overview

Your journal now has a **two-file architecture** optimized for RAG workflows:

- **650 entries** from 2016-01-19 to 2025-10-19
- **111,780 total words** (avg 172 words per entry)
- **journal_metadata.json** (0.29 MB) - Fast searchable metadata
- **journal_entries.json** (0.63 MB) - Full entry content

## Why This Structure?

Traditional single-file approaches load everything into memory. This split structure:

✅ **Faster searches** - Only loads lightweight metadata (0.29 MB)
✅ **Lazy content loading** - Full content loaded only when needed
✅ **RAG-optimized** - Search metadata → Get relevant IDs → Retrieve full content
✅ **Scalable** - Can handle thousands more entries
✅ **LLM-friendly** - Easy to feed relevant context to AI models

## File Structure

### journal_entries.json
Contains full entry content:
```json
[
  {
    "id": "2023-06-28-a1b2c3d4e5f6",
    "date": "2023-06-28",
    "content": "Full journal entry text here..."
  }
]
```

### journal_metadata.json
Contains searchable metadata keyed by ID:
```json
{
  "2023-06-28-a1b2c3d4e5f6": {
    "date": "2023-06-28",
    "summary": "1-2 sentence summary of the entry",
    "key_insights": ["Key realization 1", "Important decision 2"],
    "people": ["Jan", "David", "Giorgi"],
    "emotions": ["love", "reflection", "anxiety"],
    "concepts": ["relationships", "work", "personal_growth"],
    "word_count": 613
  }
}
```

## Usage

### Basic Search

```bash
# Show statistics
python3 search_rag.py --stats

# Search by date range
python3 search_rag.py --start 2023-01-01 --end 2023-12-31

# Search by concepts
python3 search_rag.py --concepts relationships work

# Search by people
python3 search_rag.py --people "Jan" "Giorgi"

# Search by emotions
python3 search_rag.py --emotions love reflection

# Full-text search (in summaries - FAST)
python3 search_rag.py --text "Madrid"

# Full-text search (in content - slower)
python3 search_rag.py --text "Madrid" --search-in content
```

### Advanced Search

```bash
# Combine filters (AND logic)
python3 search_rag.py --concepts relationships --emotions love --start 2023-01-01

# Show full entries
python3 search_rag.py --people "Jan" --full

# Show key insights
python3 search_rag.py --concepts work --insights

# Search both summary and content
python3 search_rag.py --text "burnout" --search-in both --insights
```

## Available Metadata

### Concepts (Top 10)
- **creativity** (54.8%)
- **work** (50.8%)
- **social** (46.2%)
- **productivity** (39.2%)
- **relationships** (33.7%)
- **finance** (31.1%)
- **identity** (28.0%)
- **personal_growth** (23.8%)
- **health** (19.8%)
- **sex** (16.6%)

### Emotions (Top 10)
- **love** (33.2%)
- **joy** (20.6%)
- **anger** (20.0%)
- **sadness** (17.1%)
- **reflection** (12.0%)
- **anxiety** (8.9%)
- **loneliness** (6.2%)
- **peace** (5.1%)
- **confidence** (4.6%)
- **guilt** (2.2%)

### Most Mentioned People
1. John - 49 entries
2. Jan - 48 entries
3. Simon - 44 entries
4. Giorgi - 39 entries
5. David - 30 entries
6. Mike - 28 entries
7. Andrew - 23 entries
8. Chris - 22 entries

## Using with RAG / LLMs

### Basic RAG Workflow

```python
import json

# 1. Load metadata (fast)
with open('journal_metadata.json', 'r') as f:
    metadata = json.load(f)

# 2. Search metadata
relevant_ids = [
    entry_id for entry_id, meta in metadata.items()
    if 'relationships' in meta['concepts'] and '2023' in meta['date']
]

# 3. Load only relevant entries
with open('journal_entries.json', 'r') as f:
    all_entries = json.load(f)
    entries_index = {e['id']: e for e in all_entries}

relevant_entries = [entries_index[eid] for eid in relevant_ids]

# 4. Create context for LLM
context = "\n\n".join([
    f"Date: {metadata[e['id']]['date']}\n"
    f"Summary: {metadata[e['id']]['summary']}\n"
    f"Content: {e['content']}"
    for e in relevant_entries[:5]  # Top 5 most relevant
])

# 5. Query LLM
prompt = f"""Based on these journal entries:

{context}

Question: How did my perspective on relationships evolve in 2023?
"""
```

### Two-Stage RAG (Recommended)

```python
# Stage 1: Search summaries (fast, broad)
summary_matches = [
    entry_id for entry_id, meta in metadata.items()
    if 'work-life balance' in meta['summary'].lower()
]

# Stage 2: Retrieve full content (precise)
full_entries = [entries_index[eid] for eid in summary_matches]

# Now feed to LLM with rich context
```

### Semantic Search with Embeddings

```python
from openai import OpenAI

client = OpenAI()

# 1. Generate embeddings for summaries (do this once)
for entry_id, meta in metadata.items():
    embedding = client.embeddings.create(
        input=meta['summary'],
        model="text-embedding-3-small"
    ).data[0].embedding

    meta['embedding'] = embedding

# 2. Query with user question
query_embedding = client.embeddings.create(
    input="When was I happiest in relationships?",
    model="text-embedding-3-small"
).data[0].embedding

# 3. Find most similar entries
from numpy import dot
from numpy.linalg import norm

def cosine_similarity(a, b):
    return dot(a, b) / (norm(a) * norm(b))

similarities = [
    (entry_id, cosine_similarity(query_embedding, meta['embedding']))
    for entry_id, meta in metadata.items()
    if 'embedding' in meta
]

# 4. Get top K entries
top_k = sorted(similarities, key=lambda x: x[1], reverse=True)[:5]
relevant_ids = [eid for eid, score in top_k]
```

## Common Query Examples

```bash
# When was I feeling anxious about work?
python3 search_rag.py --concepts work --emotions anxiety --insights

# What did I write about Jan?
python3 search_rag.py --people "Jan" --full

# Find entries about personal growth and identity
python3 search_rag.py --concepts personal_growth identity --insights

# All my reflective moments
python3 search_rag.py --emotions reflection --insights

# Find specific memory
python3 search_rag.py --text "Fire Island" --search-in content --full

# What was I working on in 2022?
python3 search_rag.py --concepts work creativity --start 2022-01-01 --end 2022-12-31

# Entries about finance and anxiety
python3 search_rag.py --concepts finance --emotions anxiety sadness
```

## Adding New Entries

When you add a new entry to your CSV and want to regenerate:

```bash
# Re-parse the CSV
python3 parse_csv_to_json.py
```

Or manually add to both files:

**journal_entries.json:**
```json
{
  "id": "2025-11-13-abc123def456",
  "date": "2025-11-13",
  "content": "Your new entry text..."
}
```

**journal_metadata.json:**
```json
"2025-11-13-abc123def456": {
  "date": "2025-11-13",
  "summary": "Brief summary of entry",
  "key_insights": ["Key insight from entry"],
  "people": ["Names mentioned"],
  "emotions": ["emotions expressed"],
  "concepts": ["themes covered"],
  "word_count": 150
}
```

## Performance Comparison

| Operation | Single File | Split Structure | Improvement |
|-----------|-------------|----------------|-------------|
| Load for search | 0.65 MB | 0.29 MB | 2.2x faster |
| Search by metadata | O(n) full scan | O(n) metadata only | 2.2x faster |
| Retrieve 5 entries | Load all | Load 5 | 130x faster |
| LLM context prep | Process 650 entries | Process 5 entries | 130x faster |

## Tips for RAG

1. **Search summaries first** - They're fast and capture main themes
2. **Use metadata filters** - Narrow down before full-text search
3. **Combine filters** - concepts + emotions + date = precise results
4. **Key insights are gold** - Pre-extracted important realizations
5. **Two-stage retrieval** - Broad search → Precise retrieval
6. **Embeddings for semantic search** - Goes beyond keyword matching
7. **Keep metadata in memory** - Only 0.29 MB, fast searches

## File Sizes

- `journal_entries.json`: 0.63 MB (content only)
- `journal_metadata.json`: 0.29 MB (metadata only)
- `journal entries - DayJournaling.csv`: Source file
- `parse_csv_to_json.py`: Parser script
- `search_rag.py`: Search tool

## Future Enhancements

- [ ] Generate embeddings for semantic search
- [ ] Add sentiment analysis to metadata
- [ ] Create vector database (Pinecone, Weaviate, Chroma)
- [ ] Build conversational Q&A interface
- [ ] Add location extraction
- [ ] Automatic topic modeling
- [ ] Temporal pattern analysis
- [ ] Graph of people/relationship dynamics

## Integration Examples

### With LangChain

```python
from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings
from langchain.text_splitter import CharacterTextSplitter

# Load entries
with open('journal_entries.json', 'r') as f:
    entries = json.load(f)

# Create vector store
texts = [e['content'] for e in entries]
metadatas = [{'date': e['date'], 'id': e['id']} for e in entries]

vectorstore = Chroma.from_texts(
    texts=texts,
    metadatas=metadatas,
    embedding=OpenAIEmbeddings()
)

# Query
results = vectorstore.similarity_search(
    "times when I felt fulfilled at work",
    k=5
)
```

### With Claude/ChatGPT

```python
import anthropic

# Search metadata first
relevant_ids = search_by_metadata(concepts=['relationships'], emotions=['anxiety'])

# Get full entries
relevant_entries = get_entries_by_ids(relevant_ids[:5])

# Build context
context = format_entries_for_llm(relevant_entries)

# Query Claude
client = anthropic.Anthropic()
message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": f"Based on these journal entries:\n\n{context}\n\nQuestion: What patterns do you notice in how I handle relationship anxiety?"
    }]
)
```

---

**Privacy Note**: All data stays local. Metadata is lightweight and optimized for search. Perfect for personal RAG systems.
