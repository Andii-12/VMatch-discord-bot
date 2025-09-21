// Test script to verify Discord bot and MongoDB connections
require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits } = require('discord.js');

console.log('🧪 Testing Discord Bot Setup...\n');

// Test 1: Environment Variables
console.log('1️⃣ Checking Environment Variables...');
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'MONGODB_URI'];
let envVarsOk = true;

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.log(`❌ Missing: ${envVar}`);
    envVarsOk = false;
  } else {
    console.log(`✅ Found: ${envVar}`);
  }
});

if (!envVarsOk) {
  console.log('\n❌ Please set all required environment variables in .env file');
  process.exit(1);
}

// Test 2: MongoDB Connection
console.log('\n2️⃣ Testing MongoDB Connection...');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    return mongoose.connection.close();
  })
  .catch(err => {
    console.log('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Test 3: Discord Bot Connection
console.log('\n3️⃣ Testing Discord Bot Connection...');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('✅ Discord bot connected successfully');
  console.log(`✅ Bot logged in as: ${client.user.tag}`);
  console.log(`✅ Bot ID: ${client.user.id}`);
  
  // Test slash commands registration
  client.application.commands.fetch()
    .then(commands => {
      console.log(`✅ Found ${commands.size} slash commands registered`);
      commands.forEach(cmd => {
        console.log(`   - /${cmd.name}: ${cmd.description}`);
      });
    })
    .catch(err => {
      console.log('⚠️  Could not fetch slash commands:', err.message);
    })
    .finally(() => {
      console.log('\n🎉 All tests passed! Your bot is ready to use.');
      console.log('\n📋 Next steps:');
      console.log('1. Run: npm start');
      console.log('2. Go to your Discord server');
      console.log('3. Try: /help');
      console.log('4. Try: /queue');
      process.exit(0);
    });
});

client.on('error', (error) => {
  console.log('❌ Discord bot connection failed:', error.message);
  process.exit(1);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.log('❌ Failed to login to Discord:', err.message);
  process.exit(1);
});
