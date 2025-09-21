# 🚀 Discord Bot Setup & Testing Guide

## Quick Start (5 minutes)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
1. Copy the environment file:
```bash
cp env.example .env
```

2. Edit `.env` with your credentials:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_server_id_here
MONGODB_URI=mongodb://localhost:27017/valorant-bot
```

### Step 3: Start the Bot
```bash
# Development mode (auto-restart on changes)
npm run dev

# OR production mode
npm start
```

## 🔧 Discord Bot Setup (Detailed)

### 1. Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "Valorant Matchmaking Bot"
4. Click "Create"

### 2. Create Bot
1. Go to "Bot" section in your application
2. Click "Add Bot"
3. Copy the **Token** (this is your `DISCORD_TOKEN`)
4. Under "Privileged Gateway Intents", enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent

### 3. Get Server ID
1. In Discord, go to User Settings → Advanced
2. Enable "Developer Mode"
3. Right-click your server name → "Copy ID" (this is your `GUILD_ID`)

### 4. Get Client ID
1. In Discord Developer Portal → General Information
2. Copy "Application ID" (this is your `CLIENT_ID`)

### 5. Invite Bot to Server
1. Go to OAuth2 → URL Generator
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select permissions:
   - ✅ Send Messages
   - ✅ Use Slash Commands
   - ✅ Embed Links
   - ✅ Read Message History
4. Copy the generated URL and open it to invite the bot

## 🗄️ MongoDB Setup

### Option A: Local MongoDB
```bash
# Install MongoDB (Windows)
# Download from: https://www.mongodb.com/try/download/community

# Start MongoDB service
net start MongoDB

# Or start manually
mongod --dbpath "C:\data\db"
```

### Option B: MongoDB Atlas (Cloud - Recommended)
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create free account
3. Create new cluster
4. Get connection string
5. Replace `<username>`, `<password>`, `<cluster>` in connection string

## 🧪 Testing the Bot

### Terminal Testing
```bash
# Check if bot starts without errors
npm start

# Expected output:
# Connected to MongoDB
# Bot is ready! Logged in as YourBot#1234
# Slash commands registered successfully
```

### Discord Testing Commands

#### 1. Test Basic Commands
```
/help
```
**Expected:** Shows all available commands

#### 2. Test Queue System
```
/queue
```
**Expected:** "You have joined the matchmaking queue. Players in queue: 1/10"

#### 3. Test Rank System
```
/rank
```
**Expected:** Shows your stats (1000 points, Iron rank, 0/0 W/L)

#### 4. Test Match History
```
/matches
```
**Expected:** "No matches found" (initially)

### Full Matchmaking Test

#### Step 1: Join Queue (10 times)
Have 10 different users or test accounts run:
```
/queue
```

#### Step 2: Verify Match Creation
When 10th player joins, bot should automatically:
- Create a match with unique ID
- Assign players to Team A and Team B
- Announce the match

#### Step 3: Test Winner Reporting
Host (first player in Team A) runs:
```
/reportwin matchID:MATCH_ABC123 team:A
```

#### Step 4: Test Voting System
Any player in the match runs:
```
/votewin matchID:MATCH_ABC123 team:B
```

#### Step 5: Verify Stats Update
Check if points and ranks updated:
```
/rank
```

## 🔍 Troubleshooting

### Common Issues & Solutions

#### 1. "Bot is not responding"
```bash
# Check console for errors
npm start

# Common fixes:
# - Wrong DISCORD_TOKEN
# - Bot not invited with proper permissions
# - Missing environment variables
```

#### 2. "MongoDB connection error"
```bash
# Check if MongoDB is running
# Local: mongod --version
# Atlas: Check connection string

# Test connection:
node -e "const mongoose = require('mongoose'); mongoose.connect('your_uri').then(() => console.log('Connected')).catch(console.error)"
```

#### 3. "Slash commands not showing"
```bash
# Commands are registered to specific server (GUILD_ID)
# Make sure GUILD_ID is correct
# Re-invite bot with applications.commands scope
```

#### 4. "Permission errors"
- Re-invite bot with all required permissions
- Check if bot has proper roles in server
- Ensure bot can see the channel

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm start

# Or add to .env:
DEBUG=discord.js:*
```

## 📊 Testing Checklist

### ✅ Basic Functionality
- [ ] Bot starts without errors
- [ ] MongoDB connection successful
- [ ] Slash commands registered
- [ ] `/help` command works
- [ ] `/rank` command works
- [ ] `/matches` command works

### ✅ Queue System
- [ ] `/queue` adds player to queue
- [ ] Player can't join queue twice
- [ ] Player can't join if in active match
- [ ] Match created when 10 players join
- [ ] Teams assigned randomly

### ✅ Match Management
- [ ] Host can report winner
- [ ] Non-host can't report winner
- [ ] Players can vote for winner
- [ ] Majority vote finalizes match
- [ ] Player stats update after match

### ✅ Data Persistence
- [ ] Player data saved to MongoDB
- [ ] Match data saved to MongoDB
- [ ] Stats persist after bot restart
- [ ] Queue state maintained

## 🚀 Production Deployment

### Environment Variables
```env
# Production settings
NODE_ENV=production
DISCORD_TOKEN=your_production_token
MONGODB_URI=your_production_mongodb_uri
```

### Process Management
```bash
# Using PM2
npm install -g pm2
pm2 start index.js --name "valorant-bot"
pm2 startup
pm2 save
```

### Monitoring
```bash
# Check bot status
pm2 status

# View logs
pm2 logs valorant-bot

# Restart bot
pm2 restart valorant-bot
```

## 📝 Quick Commands Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `npm install` | Install dependencies | - |
| `npm start` | Start bot | - |
| `npm run dev` | Start with auto-restart | - |
| `/queue` | Join matchmaking | - |
| `/rank @user` | Check player stats | `/rank @PlayerName` |
| `/matches` | View match history | - |
| `/help` | Show all commands | - |

## 🆘 Need Help?

1. **Check console logs** for error messages
2. **Verify environment variables** are set correctly
3. **Test MongoDB connection** separately
4. **Re-invite bot** with proper permissions
5. **Check Discord server permissions**

The bot should work immediately after following these steps!
