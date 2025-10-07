#!/bin/bash

# TradView Application Launcher
# This script handles all necessary steps to run the full-stack application

set -e  # Exit on any error

echo "🚀 Starting TradView Application..."
echo "=================================="

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: pnpm is not installed or not in PATH"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Install playwright
echo "📦 Installing playwright..."
pnpm --filter @tradview/server setup:playwright

# Generate protobuf files only in the proto package
echo "🔧 Generating protobuf files..."
pnpm --filter @tradview/proto generate

# Starting Monorepo on development
echo "📦 Starting Monorepo..."
pnpm dev

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "✅ Servers stopped"
    exit 0
}

# Trap Ctrl+C and cleanup
trap cleanup SIGINT

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID
