#!/usr/bin/env python3
"""
RAG-optimized Journal Search Tool
Searches metadata first, then retrieves full content by ID.
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Set
from collections import Counter

class JournalSearchRAG:
    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.metadata_file = self.base_dir / 'journal_metadata.json'
        self.entries_file = self.base_dir / 'journal_entries.json'

        self.metadata = self._load_metadata()
        self.entries_index = None  # Lazy load

    def _load_metadata(self) -> Dict:
        """Load metadata (fast, for searching)."""
        if not self.metadata_file.exists():
            print(f"Error: Metadata file not found at {self.metadata_file}")
            print("Please run parse_csv_to_json.py first.")
            return {}

        with open(self.metadata_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def _load_entries(self) -> Dict:
        """Load full entries (lazy loaded when needed)."""
        if self.entries_index is not None:
            return self.entries_index

        if not self.entries_file.exists():
            print(f"Error: Entries file not found at {self.entries_file}")
            return {}

        with open(self.entries_file, 'r', encoding='utf-8') as f:
            entries = json.load(f)

        # Create index by ID for fast lookup
        self.entries_index = {entry['id']: entry for entry in entries}
        return self.entries_index

    def search_by_date(self, start_date: str = None, end_date: str = None) -> List[str]:
        """Search by date range, returns list of entry IDs."""
        results = []

        for entry_id, meta in self.metadata.items():
            entry_date = meta['date']

            if start_date and entry_date < start_date:
                continue
            if end_date and entry_date > end_date:
                continue

            results.append(entry_id)

        return results

    def search_by_concepts(self, concepts: List[str]) -> List[str]:
        """Search by concepts, returns list of entry IDs."""
        results = []

        for entry_id, meta in self.metadata.items():
            entry_concepts = [c.lower() for c in meta.get('concepts', [])]

            if any(concept.lower() in entry_concepts for concept in concepts):
                results.append(entry_id)

        return results

    def search_by_people(self, people: List[str]) -> List[str]:
        """Search by people, returns list of entry IDs."""
        results = []

        for entry_id, meta in self.metadata.items():
            entry_people = [p.lower() for p in meta.get('people', [])]

            if any(person.lower() in entry_people for person in people):
                results.append(entry_id)

        return results

    def search_by_emotions(self, emotions: List[str]) -> List[str]:
        """Search by emotions, returns list of entry IDs."""
        results = []

        for entry_id, meta in self.metadata.items():
            entry_emotions = [e.lower() for e in meta.get('emotions', [])]

            if any(emotion.lower() in entry_emotions for emotion in emotions):
                results.append(entry_id)

        return results

    def full_text_search(self, query: str, search_in: str = 'content') -> List[str]:
        """
        Full-text search.
        search_in: 'content', 'summary', or 'both'
        """
        results = []
        query_lower = query.lower()

        if search_in in ['summary', 'both']:
            # Search in summaries (fast)
            for entry_id, meta in self.metadata.items():
                summary = meta.get('summary', '').lower()
                if query_lower in summary:
                    results.append(entry_id)

        if search_in in ['content', 'both']:
            # Search in full content (slower, lazy loads)
            entries = self._load_entries()
            for entry_id, entry in entries.items():
                if entry_id in results:
                    continue  # Already found in summary
                content = entry.get('content', '').lower()
                if query_lower in content:
                    results.append(entry_id)

        return results

    def get_entry_by_id(self, entry_id: str) -> Dict:
        """Retrieve full entry by ID."""
        entries = self._load_entries()
        return entries.get(entry_id)

    def print_results(self, entry_ids: List[str], show_full: bool = False,
                     show_metadata: bool = True, show_insights: bool = False):
        """Print search results."""
        if not entry_ids:
            print("No entries found.")
            return

        print(f"\nFound {len(entry_ids)} entries:\n")

        for i, entry_id in enumerate(entry_ids, 1):
            meta = self.metadata.get(entry_id, {})
            date = meta.get('date', 'Unknown')

            print(f"{'=' * 80}")
            print(f"[{i}] {date}")
            print(f"{'=' * 80}")

            if show_metadata:
                if meta.get('concepts'):
                    print(f"Concepts: {', '.join(meta['concepts'])}")
                if meta.get('people'):
                    print(f"People: {', '.join(meta['people'])}")
                if meta.get('emotions'):
                    print(f"Emotions: {', '.join(meta['emotions'])}")
                print(f"Word count: {meta.get('word_count', 0)}")
                print()

            # Show summary
            if not show_full:
                summary = meta.get('summary', '')
                print(f"Summary: {summary}\n")

            # Show key insights
            if show_insights and meta.get('key_insights'):
                print("Key Insights:")
                for insight in meta['key_insights']:
                    print(f"  • {insight}")
                print()

            # Show full content
            if show_full:
                entry = self.get_entry_by_id(entry_id)
                if entry:
                    content = entry.get('content', '')
                    print(content)
                    print()

            print()

    def get_statistics(self):
        """Get statistics about the journal."""
        if not self.metadata:
            return

        # Get date range
        dates = [meta['date'] for meta in self.metadata.values()]
        dates.sort()

        print("\n=== Journal Statistics ===\n")
        print(f"Total entries: {len(self.metadata)}")
        print(f"Date range: {dates[0]} to {dates[-1]}")

        total_words = sum(meta.get('word_count', 0) for meta in self.metadata.values())
        avg_words = total_words / len(self.metadata) if self.metadata else 0
        print(f"Total words: {total_words:,}")
        print(f"Average words per entry: {avg_words:.0f}")

        # Collect all metadata
        all_concepts = []
        all_emotions = []
        all_people = []

        for meta in self.metadata.values():
            all_concepts.extend(meta.get('concepts', []))
            all_emotions.extend(meta.get('emotions', []))
            all_people.extend(meta.get('people', []))

        print(f"\n=== Top 10 Concepts ===")
        for concept, count in Counter(all_concepts).most_common(10):
            percentage = (count / len(self.metadata)) * 100
            print(f"  {concept}: {count} ({percentage:.1f}%)")

        print(f"\n=== Top 10 Emotions ===")
        for emotion, count in Counter(all_emotions).most_common(10):
            percentage = (count / len(self.metadata)) * 100
            print(f"  {emotion}: {count} ({percentage:.1f}%)")

        print(f"\n=== Top 15 People ===")
        for person, count in Counter(all_people).most_common(15):
            print(f"  {person}: {count}")

        # Year distribution
        print(f"\n=== Entries by Year ===")
        years = {}
        for meta in self.metadata.values():
            year = meta['date'][:4]
            years[year] = years.get(year, 0) + 1

        for year, count in sorted(years.items()):
            print(f"  {year}: {count}")


def main():
    parser = argparse.ArgumentParser(
        description='RAG-optimized journal search tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Show statistics
  %(prog)s --stats

  # Search by date
  %(prog)s --start 2023-01-01 --end 2023-12-31

  # Search by concepts
  %(prog)s --concepts relationships work

  # Search by people
  %(prog)s --people "Jan" "David"

  # Search by emotions
  %(prog)s --emotions love anxiety

  # Full-text search (in summaries - fast)
  %(prog)s --text "Madrid" --search-in summary

  # Full-text search (in content - slower)
  %(prog)s --text "Madrid" --search-in content

  # Show full entries with insights
  %(prog)s --concepts relationships --full --insights

  # Combine filters
  %(prog)s --concepts relationships --emotions love --start 2023-01-01
        """
    )

    parser.add_argument('--start', help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end', help='End date (YYYY-MM-DD)')
    parser.add_argument('--concepts', nargs='+', help='Search by concepts')
    parser.add_argument('--people', nargs='+', help='Search by people')
    parser.add_argument('--emotions', nargs='+', help='Search by emotions')
    parser.add_argument('--text', help='Full-text search')
    parser.add_argument('--search-in', choices=['summary', 'content', 'both'],
                       default='summary', help='Where to search text (default: summary)')
    parser.add_argument('--full', action='store_true', help='Show full entries')
    parser.add_argument('--insights', action='store_true', help='Show key insights')
    parser.add_argument('--no-metadata', action='store_true', help='Hide metadata')
    parser.add_argument('--stats', action='store_true', help='Show statistics')

    args = parser.parse_args()

    script_dir = Path(__file__).parent
    searcher = JournalSearchRAG(script_dir)

    # Show statistics if requested
    if args.stats:
        searcher.get_statistics()
        return

    # Check if any search criteria provided
    if not any([args.start, args.end, args.concepts, args.people, args.emotions, args.text]):
        parser.print_help()
        return

    # Start with all entry IDs
    result_ids = set(searcher.metadata.keys())

    # Apply filters (intersection)
    if args.start or args.end:
        date_ids = set(searcher.search_by_date(args.start, args.end))
        result_ids &= date_ids

    if args.concepts:
        concept_ids = set(searcher.search_by_concepts(args.concepts))
        result_ids &= concept_ids

    if args.people:
        people_ids = set(searcher.search_by_people(args.people))
        result_ids &= people_ids

    if args.emotions:
        emotion_ids = set(searcher.search_by_emotions(args.emotions))
        result_ids &= emotion_ids

    if args.text:
        text_ids = set(searcher.full_text_search(args.text, args.search_in))
        result_ids &= text_ids

    # Sort by date
    result_ids = sorted(
        result_ids,
        key=lambda eid: searcher.metadata[eid]['date']
    )

    # Print results
    searcher.print_results(
        result_ids,
        show_full=args.full,
        show_metadata=not args.no_metadata,
        show_insights=args.insights
    )


if __name__ == '__main__':
    main()
