#!/bin/bash

# Valorant Discord Bot - Web App Deployment Script
# This script helps deploy the React web app to various platforms

echo "🚀 Valorant Discord Bot - Web App Deployment"
echo "=============================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Build the project
echo "🔨 Building the project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build completed successfully"

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "❌ Build directory not found"
    exit 1
fi

echo "📁 Build directory created: build/"

# Deployment options
echo ""
echo "🎯 Choose deployment option:"
echo "1. Vercel (Recommended)"
echo "2. Netlify"
echo "3. GitHub Pages"
echo "4. Local preview"
echo "5. Exit"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo "🚀 Deploying to Vercel..."
        echo "1. Install Vercel CLI: npm i -g vercel"
        echo "2. Run: vercel"
        echo "3. Follow the prompts"
        echo "4. Your app will be deployed to a Vercel URL"
        ;;
    2)
        echo "🚀 Deploying to Netlify..."
        echo "1. Go to https://netlify.com"
        echo "2. Drag and drop the 'build' folder"
        echo "3. Or connect your GitHub repository"
        echo "4. Your app will be deployed automatically"
        ;;
    3)
        echo "🚀 Deploying to GitHub Pages..."
        echo "1. Install gh-pages: npm install --save-dev gh-pages"
        echo "2. Add to package.json scripts:"
        echo '   "predeploy": "npm run build",'
        echo '   "deploy": "gh-pages -d build"'
        echo "3. Run: npm run deploy"
        echo "4. Enable GitHub Pages in repository settings"
        ;;
    4)
        echo "🚀 Starting local preview..."
        echo "Starting development server..."
        npm start
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment process completed!"
echo ""
echo "📋 Next steps:"
echo "1. Update your bot's Client ID in the deployed app"
echo "2. Test the invite link"
echo "3. Share the web app URL with your community"
echo ""
echo "🔗 Useful links:"
echo "- Discord Developer Portal: https://discord.com/developers/applications"
echo "- Bot Invite Guide: ../BOT_INVITE_GUIDE.md"
echo "- Main README: ../README.md"
