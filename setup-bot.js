// Automated setup script for Discord bot
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupBot() {
  console.log('🤖 Valorant Discord Bot Setup\n');
  console.log('This script will help you configure your bot.\n');

  // Check if .env already exists
  if (fs.existsSync('.env')) {
    const overwrite = await question('⚠️  .env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('📋 Please provide the following information:\n');

  // Get Discord Bot Token
  console.log('1. Discord Bot Token');
  console.log('   Go to: https://discord.com/developers/applications');
  console.log('   → Your Application → Bot → Token → Copy\n');
  const discordToken = await question('Discord Bot Token: ');

  // Get Client ID
  console.log('\n2. Client ID (Application ID)');
  console.log('   Same page → General Information → Application ID\n');
  const clientId = await question('Client ID: ');

  // Get Guild ID
  console.log('\n3. Guild ID (Server ID)');
  console.log('   In Discord: User Settings → Advanced → Developer Mode (ON)');
  console.log('   Right-click server name → Copy ID\n');
  const guildId = await question('Guild ID: ');

  // Get MongoDB URI
  console.log('\n4. MongoDB URI');
  console.log('   Local: mongodb://localhost:27017/valorant-bot');
  console.log('   Atlas: mongodb+srv://username:password@cluster.mongodb.net/valorant-bot\n');
  const mongoUri = await question('MongoDB URI (or press Enter for local): ') || 'mongodb://localhost:27017/valorant-bot';

  // Create .env file
  const envContent = `# Discord Bot Configuration
DISCORD_TOKEN=${discordToken}
CLIENT_ID=${clientId}
GUILD_ID=${guildId}

# MongoDB Configuration
MONGODB_URI=${mongoUri}
`;

  fs.writeFileSync('.env', envContent);
  console.log('\n✅ .env file created successfully!');

  // Test connections
  console.log('\n🧪 Testing connections...');
  const { spawn } = require('child_process');
  
  const testProcess = spawn('node', ['test-connection.js'], { stdio: 'inherit' });
  
  testProcess.on('close', (code) => {
    if (code === 0) {
      console.log('\n🎉 Setup complete! Your bot is ready to use.');
      console.log('\n📋 Next steps:');
      console.log('1. Run: npm start');
      console.log('2. Go to your Discord server');
      console.log('3. Try: /help');
    } else {
      console.log('\n❌ Setup completed but there were some issues.');
      console.log('Please check the error messages above and fix them.');
    }
    rl.close();
  });
}

setupBot().catch(console.error);
