#!/usr/bin/env python3
"""
Parse CSV journal entries and create RAG-optimized JSON structure.
Splits into entries (content) and metadata (for search/retrieval).
"""

import csv
import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Tuple
import re
from collections import Counter

class JournalParser:
    def __init__(self, csv_path: str):
        self.csv_path = Path(csv_path)
        self.entries = []
        self.metadata = {}

    def parse_date(self, date_str: str) -> str:
        """Parse various date formats into YYYY-MM-DD."""
        date_str = date_str.strip()

        # Try different formats
        formats = [
            '%m/%d/%Y',      # 02/11/2025
            '%Y/%m/%d',      # 2016/01/19
            '%m/%d',         # 7/15 (assume current year)
            '%d/%m/%Y',      # 19/01/2016
            '%Y-%m-%d',      # 2023-06-28 (already correct)
        ]

        for fmt in formats:
            try:
                if '/' in date_str and len(date_str.split('/')) == 2:
                    # Month/day without year - assume 2018 as default for old entries
                    parts = date_str.split('/')
                    date_str = f"{parts[0]}/{parts[1]}/2018"
                    fmt = '%m/%d/%Y'

                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue

        # If all else fails, return original
        print(f"  ⚠ Could not parse date: {date_str}")
        return date_str

    def generate_id(self, date: str, content: str) -> str:
        """Generate a unique ID for an entry."""
        # Use date + first 50 chars of content to create hash
        unique_str = f"{date}-{content[:50]}"
        hash_obj = hashlib.md5(unique_str.encode())
        return f"{date}-{hash_obj.hexdigest()[:12]}"

    def parse_csv(self) -> Tuple[List[Dict], Dict]:
        """Parse CSV and return entries and metadata."""
        print(f"Reading CSV from {self.csv_path}...")

        entries = []

        with open(self.csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for i, row in enumerate(reader, 1):
                date_raw = row.get('date', '').strip()
                content = row.get('content', '').strip()

                if not date_raw or not content:
                    continue

                # Parse date
                date = self.parse_date(date_raw)

                # Generate ID
                entry_id = self.generate_id(date, content)

                entry = {
                    'id': entry_id,
                    'date': date,
                    'content': content
                }

                entries.append(entry)

                if i % 50 == 0:
                    print(f"  Parsed {i} rows...")

        # Sort by date
        entries.sort(key=lambda x: x['date'])

        print(f"\n✓ Parsed {len(entries)} entries")
        return entries

    def extract_people(self, content: str) -> List[str]:
        """Extract potential people names from content."""
        # Find capitalized words
        words = re.findall(r'\b[A-Z][a-z]+\b', content)

        # Filter out common words and dates
        common_words = {
            'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
            'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
            'September', 'October', 'November', 'December', 'I', 'The', 'This', 'That',
            'But', 'You', 'Your', 'Had', 'Got', 'We', 'Today', 'Tomorrow', 'Yesterday',
            'Now', 'Then', 'Will', 'Would', 'Could', 'Should', 'Made', 'Went', 'He',
            'She', 'They', 'Them', 'There', 'Here', 'Being', 'Having', 'Feeling',
            'Woke', 'Started', 'Finished', 'Met', 'While', 'After', 'Before', 'During',
            'Things', 'Everything', 'Someone', 'Everyone', 'Anyone', 'Something',
            'CrossFit', 'Madrid', 'Barcelona', 'Brazil', 'NYC', 'Island', 'Fire',
            'Harvard', 'Yale', 'Stanford', 'Cambridge', 'Oxford'
        }

        # Count occurrences
        word_counts = Counter(words)

        # Keep names that appear multiple times or are common names
        people = [
            word for word, count in word_counts.items()
            if word not in common_words and (count > 1 or self._is_likely_name(word))
        ]

        return sorted(set(people))[:15]  # Limit to top 15

    def _is_likely_name(self, word: str) -> bool:
        """Check if a word is likely a person's name."""
        # Names are usually 3+ characters and not all caps
        if len(word) < 3:
            return False
        if word.isupper():
            return False
        # Common name patterns
        common_names = {'John', 'Mike', 'David', 'Chris', 'Tom', 'Paul', 'Peter',
                       'Simon', 'James', 'Robert', 'Daniel', 'Andrew', 'Kevin',
                       'Jan', 'Marc', 'Alex', 'Eric', 'Ryan', 'Matt', 'Luke'}
        return word in common_names

    def extract_emotions(self, content: str) -> List[str]:
        """Extract emotions from content."""
        emotion_keywords = {
            'joy': ['happy', 'joyful', 'excited', 'thrilled', 'delighted', 'wonderful', 'amazing', 'great'],
            'love': ['love', 'affection', 'adore', 'romantic', 'sweet', 'cute', 'beautiful'],
            'anxiety': ['anxious', 'worried', 'stressed', 'nervous', 'afraid', 'fear', 'panic'],
            'sadness': ['sad', 'depressed', 'disappointed', 'hurt', 'upset', 'down'],
            'anger': ['angry', 'frustrated', 'annoyed', 'mad', 'irritated', 'resentment'],
            'reflection': ['reflective', 'contemplating', 'realized', 'understanding', 'insight'],
            'peace': ['peaceful', 'calm', 'serene', 'tranquil', 'relaxed', 'content'],
            'confusion': ['confused', 'uncertain', 'unclear', 'conflicted', 'torn'],
            'guilt': ['guilty', 'regret', 'shame', 'remorse'],
            'gratitude': ['grateful', 'thankful', 'appreciative', 'blessed'],
            'loneliness': ['lonely', 'isolated', 'alone', 'disconnected'],
            'confidence': ['confident', 'proud', 'accomplished', 'successful'],
        }

        content_lower = content.lower()
        emotions = []

        for emotion, keywords in emotion_keywords.items():
            if any(keyword in content_lower for keyword in keywords):
                emotions.append(emotion)

        return emotions

    def extract_concepts(self, content: str) -> List[str]:
        """Extract key concepts/themes from content."""
        concept_keywords = {
            'relationships': ['relationship', 'dating', 'love', 'partner', 'boyfriend', 'girlfriend', 'marriage'],
            'work': ['work', 'job', 'project', 'career', 'meeting', 'client', 'professional'],
            'health': ['health', 'fitness', 'workout', 'gym', 'exercise', 'crossfit', 'body'],
            'finance': ['money', 'spent', 'bill', 'saving', 'wealth', 'investment', 'financial', 'capital'],
            'social': ['party', 'friends', 'social', 'scene', 'people', 'dinner'],
            'travel': ['travel', 'trip', 'flight', 'airplane', 'vacation', 'visiting'],
            'personal_growth': ['learning', 'growth', 'improve', 'better', 'development', 'progress'],
            'mental_health': ['anxiety', 'therapy', 'meditation', 'mindfulness', 'mental'],
            'creativity': ['creative', 'art', 'music', 'design', 'project'],
            'family': ['family', 'mother', 'father', 'sister', 'brother', 'parents', 'grandma'],
            'sex': ['sex', 'hookup', 'intimate', 'attraction', 'physical'],
            'productivity': ['productive', 'focus', 'discipline', 'structure', 'organize'],
            'identity': ['identity', 'who i am', 'myself', 'change', 'become'],
        }

        content_lower = content.lower()
        concepts = []

        for concept, keywords in concept_keywords.items():
            if any(keyword in content_lower for keyword in keywords):
                concepts.append(concept)

        return concepts

    def generate_summary(self, content: str) -> str:
        """Generate a 1-2 sentence summary of the entry."""
        # Take first sentence and clean it
        sentences = re.split(r'[.!?]+', content)

        # Get first 1-2 meaningful sentences
        summary_parts = []
        for sentence in sentences[:3]:
            sentence = sentence.strip()
            if len(sentence) > 20:  # Skip very short fragments
                summary_parts.append(sentence)
                if len(' '.join(summary_parts)) > 150:
                    break

        summary = '. '.join(summary_parts[:2])

        # Truncate if too long
        if len(summary) > 200:
            summary = summary[:197] + '...'
        elif not summary.endswith('.'):
            summary += '.'

        return summary

    def extract_key_insights(self, content: str) -> List[str]:
        """Extract key insights or realizations from the entry."""
        insights = []

        # Look for insight markers
        insight_markers = [
            'realized', 'understand', 'learned', 'insight', 'reflection',
            'came to terms', 'accepted', 'decided', 'committed', 'goal'
        ]

        sentences = re.split(r'[.!?]+', content)

        for sentence in sentences:
            sentence = sentence.strip()
            sentence_lower = sentence.lower()

            # Check if sentence contains insight markers
            if any(marker in sentence_lower for marker in insight_markers):
                if len(sentence) > 30 and len(sentence) < 200:
                    insights.append(sentence)
                    if len(insights) >= 3:  # Limit to 3 insights
                        break

        return insights

    def generate_metadata(self, entries: List[Dict]) -> Dict:
        """Generate metadata for all entries."""
        print("\nGenerating metadata...")

        metadata = {}

        for i, entry in enumerate(entries, 1):
            entry_id = entry['id']
            date = entry['date']
            content = entry['content']

            # Extract metadata
            people = self.extract_people(content)
            emotions = self.extract_emotions(content)
            concepts = self.extract_concepts(content)
            summary = self.generate_summary(content)
            key_insights = self.extract_key_insights(content)

            metadata[entry_id] = {
                'date': date,
                'summary': summary,
                'key_insights': key_insights,
                'people': people,
                'emotions': emotions,
                'concepts': concepts,
                'word_count': len(content.split())
            }

            if i % 50 == 0:
                print(f"  Generated metadata for {i}/{len(entries)} entries...")

        print(f"\n✓ Generated metadata for {len(metadata)} entries")
        return metadata

    def save_json(self, entries: List[Dict], metadata: Dict, base_dir: Path):
        """Save entries and metadata to separate JSON files."""
        # Save entries
        entries_file = base_dir / 'journal_entries.json'
        with open(entries_file, 'w', encoding='utf-8') as f:
            json.dump(entries, f, indent=2, ensure_ascii=False)

        entries_size = entries_file.stat().st_size / (1024 * 1024)
        print(f"\n✓ Entries saved to: {entries_file}")
        print(f"  Size: {entries_size:.2f} MB")
        print(f"  Count: {len(entries)}")

        # Save metadata
        metadata_file = base_dir / 'journal_metadata.json'
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        metadata_size = metadata_file.stat().st_size / (1024 * 1024)
        print(f"\n✓ Metadata saved to: {metadata_file}")
        print(f"  Size: {metadata_size:.2f} MB")
        print(f"  Count: {len(metadata)}")

        return entries_file, metadata_file

    def print_statistics(self, entries: List[Dict], metadata: Dict):
        """Print statistics about the journal."""
        print("\n" + "="*80)
        print("JOURNAL STATISTICS")
        print("="*80)

        print(f"\nTotal entries: {len(entries)}")
        print(f"Date range: {entries[0]['date']} to {entries[-1]['date']}")

        total_words = sum(m['word_count'] for m in metadata.values())
        avg_words = total_words / len(entries) if entries else 0
        print(f"Total words: {total_words:,}")
        print(f"Average words per entry: {avg_words:.0f}")

        # Collect all metadata
        all_concepts = []
        all_emotions = []
        all_people = []

        for m in metadata.values():
            all_concepts.extend(m['concepts'])
            all_emotions.extend(m['emotions'])
            all_people.extend(m['people'])

        print(f"\n=== Top 10 Concepts ===")
        for concept, count in Counter(all_concepts).most_common(10):
            percentage = (count / len(entries)) * 100
            print(f"  {concept}: {count} ({percentage:.1f}%)")

        print(f"\n=== Top 10 Emotions ===")
        for emotion, count in Counter(all_emotions).most_common(10):
            percentage = (count / len(entries)) * 100
            print(f"  {emotion}: {count} ({percentage:.1f}%)")

        print(f"\n=== Top 15 People ===")
        for person, count in Counter(all_people).most_common(15):
            print(f"  {person}: {count}")

def main():
    csv_path = Path(__file__).parent / "journal entries - DayJournaling.csv"

    if not csv_path.exists():
        print(f"Error: CSV file not found at {csv_path}")
        return

    parser = JournalParser(csv_path)

    # Parse CSV
    entries = parser.parse_csv()

    # Generate metadata
    metadata = parser.generate_metadata(entries)

    # Save JSON files
    parser.save_json(entries, metadata, Path(__file__).parent)

    # Print statistics
    parser.print_statistics(entries, metadata)

    print("\n" + "="*80)
    print("✓ COMPLETE!")
    print("="*80)
    print("\nYou now have:")
    print("  • journal_entries.json - All entry content")
    print("  • journal_metadata.json - Searchable metadata for RAG")
    print("\nUse metadata for search/retrieval, then fetch full content by ID.")

if __name__ == '__main__':
    main()
