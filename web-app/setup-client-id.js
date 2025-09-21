#!/usr/bin/env node

/**
 * Valorant Discord Bot - Client ID Setup Script
 * This script helps you easily set up your bot's Client ID in the web app
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🤖 Valorant Discord Bot - Client ID Setup');
console.log('==========================================');
console.log('');

// Function to update Client ID in App.js
function updateClientId(clientId) {
  const appJsPath = path.join(__dirname, 'src', 'App.js');
  
  try {
    let content = fs.readFileSync(appJsPath, 'utf8');
    
    // Replace the placeholder with actual Client ID
    content = content.replace('YOUR_CLIENT_ID_HERE', clientId);
    
    fs.writeFileSync(appJsPath, content);
    
    console.log('✅ Client ID updated successfully!');
    console.log(`📝 Updated: ${appJsPath}`);
    return true;
  } catch (error) {
    console.error('❌ Error updating Client ID:', error.message);
    return false;
  }
}

// Function to generate invite link
function generateInviteLink(clientId) {
  const permissions = '8'; // Administrator permission
  const scope = 'bot%20applications.commands';
  
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}`;
}

// Main setup process
async function setup() {
  console.log('📋 This script will help you set up your bot\'s Client ID.');
  console.log('');
  console.log('🔗 To get your Client ID:');
  console.log('1. Go to https://discord.com/developers/applications');
  console.log('2. Select your bot application');
  console.log('3. Go to "General Information"');
  console.log('4. Copy the "Application ID" (this is your Client ID)');
  console.log('');
  
  rl.question('Enter your bot\'s Client ID: ', (clientId) => {
    // Validate Client ID format (should be 17-19 digits)
    if (!/^\d{17,19}$/.test(clientId)) {
      console.log('❌ Invalid Client ID format. Please enter a valid Discord Application ID (17-19 digits).');
      rl.close();
      return;
    }
    
    console.log('');
    console.log('🔄 Updating Client ID...');
    
    if (updateClientId(clientId)) {
      console.log('');
      console.log('🎉 Setup completed successfully!');
      console.log('');
      console.log('📋 Next steps:');
      console.log('1. Run: npm start');
      console.log('2. Open http://localhost:3000');
      console.log('3. Click the "Invite Bot to Server" button');
      console.log('');
      console.log('🔗 Your bot invite link:');
      console.log(generateInviteLink(clientId));
      console.log('');
      console.log('⚠️  Make sure your bot is running before testing the invite link!');
    }
    
    rl.close();
  });
}

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log('\n👋 Setup cancelled. Run the script again when ready!');
  rl.close();
});

// Start the setup
setup();
