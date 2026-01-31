#!/bin/bash

# Function to handle script termination
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    # Kill all child processes in the same process group
    pkill -P $$ 
    exit
}

# Trap SIGINT (Ctrl+C) and call cleanup
trap cleanup SIGINT

echo "🚀 Starting Multi-Pulpy Reporting Portal..."
echo "==========================================="

# Get the script's directory to ensure relative paths work
DIR="$(cd "$(dirname "$0")" && pwd)"

# Start Backend
echo "📦 Starting Backend (Port 5000)..."
cd "$DIR/Pulpy_Reporting_Portal_Backend" || { echo "❌ Backend directory not found!"; exit 1; }
npm run dev &
BACKEND_PID=$!
echo "✅ Backend started with PID $BACKEND_PID"

# Start Frontend
echo "🖥️  Starting Frontend (Vite)..."
cd "$DIR/Pulpy_Reporting_Portal_frontend" || { echo "❌ Frontend directory not found!"; exit 1; }
npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend started with PID $FRONTEND_PID"

echo "==========================================="
echo "Create a new terminal tab to run other commands."
echo "Press Ctrl+C to stop both servers."
echo "==========================================="

# Wait for both processes
wait
