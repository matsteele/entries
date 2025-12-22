#!/bin/bash

# Start both the backend server and frontend dev server

echo "🚀 Starting backend server on port 5001..."
node app/backend/server.js &
SERVER_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
until curl -s http://localhost:5001/api/health > /dev/null 2>&1; do
  sleep 0.5
done
echo "✅ Backend is ready!"

echo "🚀 Starting frontend dev server on port 5173..."
cd app/frontend && npm run dev &
FRONTEND_PID=$!

# Trap SIGINT (Ctrl+C) and SIGTERM to clean up both processes
trap "echo ''; echo '🛑 Shutting down servers...'; kill $SERVER_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

echo ""
echo "✅ Both servers are running!"
echo "   Backend:  http://localhost:5001"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for both processes
wait
