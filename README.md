# Valorant Discord Matchmaking Bot

A Discord bot for Valorant custom matchmaking with MongoDB integration, featuring queue management, match creation, voting system, and player ranking.

## 🌟 Features

- **🎮 Dual Mode Support**: Both 1v1 duels and 5v5 team battles
- **⚡ Accept/Decline System**: Players must accept matches before they start
- **🏆 Dynamic MMR System**: Advanced ranking with separate 1v1 and 5v5 MMR
- **🎯 Smart Matchmaking**: Intelligent team balancing and MMR-based matching
- **🏅 Winner Selection**: Easy button-based winner reporting system
- **📊 Real-time Statistics**: Live match tracking and player statistics
- **🌐 Web App**: Beautiful React web interface for bot management
- **🔧 MongoDB Integration**: Persistent data storage for all game data

## 🎮 Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `/vmode` | Choose between 1v1 and 5v5 modes | `/vmode` |
| `/vplay` | Start searching for a match | `/vplay` |
| `/vmatch` | View instructions and quick start | `/vmatch` |
| `/votewin` | Vote for match winner | `/votewin matchID:MATCH_123 team:B` |
| `/rank` | Show player stats and MMR | `/rank` or `/rank @user` |
| `/matches` | Show active and recent matches | `/matches` |
| `/vsetup` | Setup dedicated channels (Admin) | `/vsetup` |
| `/help` | Show all available commands | `/help` |

## 🌐 Web Application

The project includes a beautiful React web app for easy bot management and invitation.

### Quick Start Web App:
```bash
cd web-app
npm install
npm start
```

### Features:
- 🚀 One-click bot invitation
- 📋 Step-by-step setup guide
- 🎨 Modern, responsive design
- 📱 Mobile-friendly interface
- 🔧 Easy customization

## 🤖 Bot Invite Link

### Quick Method:
1. Get your bot's **Client ID** from [Discord Developer Portal](https://discord.com/developers/applications)
2. Replace `YOUR_CLIENT_ID_HERE` in `web-app/src/App.js` with your Client ID
3. Use the generated invite button in the web app

### Manual Method:
Use this template and replace `YOUR_CLIENT_ID` with your actual Client ID:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

### Required Permissions:
- ✅ Send Messages
- ✅ Use Slash Commands
- ✅ Manage Channels
- ✅ Manage Messages
- ✅ Embed Links
- ✅ Attach Files

📖 **Detailed Guide**: See [BOT_INVITE_GUIDE.md](BOT_INVITE_GUIDE.md) for complete setup instructions.

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or MongoDB Atlas)
- Discord Bot Token
- Discord Application with Bot permissions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd Discord-bot
npm install
```

### 2. Environment Configuration

1. Copy `env.example` to `.env`:
```bash
cp env.example .env
```

2. Fill in your configuration in `.env`:
```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_discord_server_id_here

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/valorant-bot
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/valorant-bot
```

### 3. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token to your `.env` file
5. Go to "OAuth2" > "URL Generator"
6. Select "bot" and "applications.commands" scopes
7. Select necessary permissions (Send Messages, Use Slash Commands, etc.)
8. Use the generated URL to invite the bot to your server

### 4. MongoDB Setup

#### Option A: Local MongoDB
1. Install MongoDB locally
2. Start MongoDB service
3. Use `mongodb://localhost:27017/valorant-bot` as your MONGODB_URI

#### Option B: MongoDB Atlas (Recommended)
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a new cluster
3. Get your connection string
4. Replace `<username>`, `<password>`, and `<cluster>` in the connection string
5. Use this as your MONGODB_URI

### 5. Run the Bot

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

## How It Works

### Queue System
- Players use `/queue` to join the matchmaking queue
- When 10 players are in the queue, a match is automatically created
- Players are randomly assigned to Team A or Team B
- The first player becomes the match host

### Match Management
- Each match gets a unique ID (e.g., MATCH_ABC123)
- Matches can be in three states: waiting, active, finished
- Host can report winners using `/reportwin`
- Players can vote for winners using `/votewin`
- If majority of players vote for the same team, the match is finalized

### Ranking System
- Players start with 1000 points
- Winning a match: +25 points
- Losing a match: -15 points
- Ranks are automatically calculated based on points:
  - Iron (0-199)
  - Bronze 1-3 (200-399)
  - Silver 1-3 (500-799)
  - Gold 1-3 (800-1199)
  - Platinum 1-3 (1100-1399)
  - Diamond 1-3 (1400-1699)
  - Immortal 1-3 (1700-1999)
  - Radiant (2000+)

## Database Schema

### Player Model
```javascript
{
  discordId: String (unique),
  username: String,
  points: Number (default: 1000),
  wins: Number (default: 0),
  losses: Number (default: 0),
  rank: String (default: 'Iron'),
  isInQueue: Boolean (default: false),
  currentMatchId: String (default: null)
}
```

### Match Model
```javascript
{
  matchId: String (unique),
  hostId: String,
  teamA: [String], // Array of player IDs
  teamB: [String], // Array of player IDs
  status: String (waiting/active/finished),
  winner: String (A/B/null),
  votes: [Object], // Array of vote objects
  createdAt: Date,
  finishedAt: Date
}
```

## Troubleshooting

### Common Issues

1. **Bot not responding to commands**
   - Check if the bot token is correct
   - Ensure the bot has proper permissions in your server
   - Verify slash commands are registered (check console logs)

2. **MongoDB connection errors**
   - Verify your MongoDB URI is correct
   - Check if MongoDB is running (for local setup)
   - Ensure your IP is whitelisted (for MongoDB Atlas)

3. **Commands not showing up**
   - Make sure you're using slash commands (not regular messages)
   - Check if the bot has "applications.commands" scope
   - Try re-inviting the bot with updated permissions

### Getting Help

If you encounter issues:
1. Check the console logs for error messages
2. Verify your environment variables are set correctly
3. Ensure all dependencies are installed
4. Check Discord and MongoDB connection status

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the ISC License.
