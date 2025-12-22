# Personal Productivity System

A comprehensive personal productivity and journaling system with planning, time tracking, and reflection capabilities.

## Features

- **Daily Logging**: Track daily activities and reflections
- **Journal System**: Personal journaling with RAG (Retrieval Augmented Generation) search
- **Planning System**: Project planning and task management
- **Time Tracking**: Monitor time spent on activities
- **Protocols**: Structured workflows for various activities

## Tech Stack

- Node.js backend services
- Supabase/PostgreSQL database with vector search
- Python scripts for data processing
- CLI tools for daily interactions

## Getting Started

### Prerequisites

- Node.js (version specified in `.nvmrc`)
- PostgreSQL/Supabase
- Python 3.x (for journal scripts)

### Installation

```bash
npm install
cd app/backend && npm install
```

### Configuration

Create a `.env` file with your configuration (see `.env.example` if available).

## Project Structure

- `app/backend/` - Backend services and CLI tools
- `journal/` - Journaling system with templates and scripts
- `plans/` - Planning system with active plans and templates
- `protocols/` - Structured workflow guides
- `scripts/` - Utility and migration scripts
- `supabase/` - Database migrations and configuration

## Privacy & Security

This repository uses a comprehensive `.gitignore` to ensure:
- Personal daily logs are NOT committed
- Time tracking data stays private
- Authentication credentials are protected
- Personal reflections and data remain local

**Note**: Never commit files containing personal information, credentials, or API keys.

## License

Private repository - Personal use only

