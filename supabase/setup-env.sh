#!/bin/bash
# Setup environment file for Supabase

cat > .env << 'EOF'
# Supabase Configuration
SUPABASE_URL=https://hjajrstidftkjwqmdung.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqYWpyc3RpZGZ0a2p3cW1kdW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxMDE2MTAsImV4cCI6MjA3ODY3NzYxMH0.W2bWJ1W5hoszIiYq1vvv8Xx45WmvRG5KkKAtOkZYaKw
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI Configuration (for embeddings)
OPENAI_API_KEY=your-openai-api-key-here
EOF

echo "✅ Created .env file"
echo ""
echo "⚠️  Please edit .env and add:"
echo "   - SUPABASE_SERVICE_ROLE_KEY (from Supabase dashboard → Settings → API)"
echo "   - OPENAI_API_KEY (from https://platform.openai.com/api-keys)"

