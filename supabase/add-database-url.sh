#!/bin/bash
# Add DATABASE_URL to .env file

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    exit 1
fi

# Check if DATABASE_URL already exists
if grep -q "DATABASE_URL" .env; then
    echo "⚠️  DATABASE_URL already exists in .env"
    echo "Please update it manually if needed"
else
    echo "" >> .env
    echo "# Session Pooler Connection (IPv4 compatible)" >> .env
    echo "DATABASE_URL=postgresql://postgres.hjajrstidftkjwqmdung:journal2025planprotocols@aws-0-us-east-1.pooler.supabase.com:5432/postgres" >> .env
    echo "" >> .env
    echo "# Direct Connection (alternative)" >> .env
    echo "DATABASE_URL_DIRECT=postgresql://postgres:journal2025planprotocols@db.hjajrstidftkjwqmdung.supabase.co:5432/postgres" >> .env
    echo "✅ Added DATABASE_URL to .env"
fi

echo ""
echo "Current .env file:"
cat .env

