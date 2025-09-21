# 🤖 Discord Bot Invite Link Guide

This guide will show you how to get your Discord bot invite link and set up the necessary permissions.

## 📋 Prerequisites

- Your Discord bot is created and configured
- You have access to the [Discord Developer Portal](https://discord.com/developers/applications)
- Your bot token and client ID are ready

## 🚀 Step-by-Step Guide

### Step 1: Get Your Bot's Client ID

1. **Go to Discord Developer Portal**
   - Visit: https://discord.com/developers/applications
   - Log in with your Discord account

2. **Select Your Bot Application**
   - Click on your bot application from the list
   - If you don't have one, create a new application

3. **Copy the Application ID**
   - Go to "General Information" tab
   - Copy the "Application ID" (this is your Client ID)
   - Save this ID - you'll need it for the invite link

### Step 2: Generate the Invite Link

#### Method 1: Use the Web App (Recommended)
1. Open the React web app (`web-app` folder)
2. Replace `YOUR_CLIENT_ID_HERE` in `src/App.js` with your actual Client ID
3. The invite button will automatically generate the correct link

#### Method 2: Manual URL Generation
Use this template and replace `YOUR_CLIENT_ID` with your actual Client ID:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

**Example:**
If your Client ID is `123456789012345678`, your invite link would be:
```
https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=8&scope=bot%20applications.commands
```

### Step 3: Required Permissions

Your bot needs these permissions to work properly:

| Permission | Required | Reason |
|------------|----------|---------|
| **Send Messages** | ✅ Yes | Send match announcements and responses |
| **Use Slash Commands** | ✅ Yes | Enable slash command functionality |
| **Manage Channels** | ✅ Yes | Create dedicated channels with `/vsetup` |
| **Manage Messages** | ✅ Yes | Delete messages in party-code channel |
| **Embed Links** | ✅ Yes | Send rich embeds with match information |
| **Attach Files** | ✅ Yes | Handle screenshot uploads (if needed) |
| **Read Message History** | ✅ Yes | Read party codes and messages |
| **Add Reactions** | ✅ Yes | React to messages |
| **Connect** | ✅ Yes | Connect to voice channels (if needed) |
| **Speak** | ✅ Yes | Speak in voice channels (if needed) |

### Step 4: Permission Calculator (Alternative Method)

1. Go to: https://discordapi.com/permissions.html
2. Enter your Client ID
3. Select the required permissions (check the table above)
4. Copy the generated invite link

### Step 5: Test the Invite Link

1. **Click the invite link**
2. **Select your Discord server** where you want to add the bot
3. **Review the permissions** - make sure all required permissions are checked
4. **Click "Authorize"**
5. **Verify the bot appears** in your server's member list

## 🔧 Troubleshooting

### Common Issues:

#### ❌ "Invalid Client ID"
- **Problem**: The Client ID is incorrect or the application doesn't exist
- **Solution**: Double-check the Client ID from Discord Developer Portal

#### ❌ "Missing Permissions"
- **Problem**: The bot doesn't have required permissions
- **Solution**: Re-invite the bot with correct permissions or use `/vsetup` to fix channel permissions

#### ❌ "Bot Not Responding"
- **Problem**: Bot is offline or not running
- **Solution**: Make sure your bot is running (`npm start` in the main project folder)

#### ❌ "Slash Commands Not Working"
- **Problem**: Slash commands not registered
- **Solution**: Run the bot once to register commands, or use the setup script

### Permission Issues:

#### ❌ "Cannot Create Channels"
- **Problem**: Bot lacks "Manage Channels" permission
- **Solution**: Re-invite with correct permissions or manually give the bot the permission

#### ❌ "Cannot Delete Messages"
- **Problem**: Bot lacks "Manage Messages" permission
- **Solution**: Re-invite with correct permissions

## 🎯 Quick Setup Commands

After inviting the bot, run these commands in your Discord server:

1. **Setup Channels** (Admin only):
   ```
   /vsetup
   ```

2. **Test Bot** (Any user):
   ```
   /vmatch
   ```

3. **Start Matchmaking** (Any user):
   ```
   /vmode
   ```

## 📱 Mobile Users

The invite link works on mobile Discord apps too:
1. Open the invite link on your mobile device
2. It will open the Discord app
3. Select your server and authorize

## 🔒 Security Notes

- **Never share your bot token** publicly
- **Only invite the bot to servers you trust**
- **Regularly review bot permissions** and remove unnecessary ones
- **Use environment variables** for sensitive data

## 📞 Support

If you're still having issues:

1. **Check the bot logs** for error messages
2. **Verify all environment variables** are set correctly
3. **Ensure the bot is online** and responding to commands
4. **Check Discord server permissions** for the bot role

## 🎉 Success!

Once everything is working:
- ✅ Bot appears in your server
- ✅ Slash commands are available
- ✅ `/vsetup` creates the required channels
- ✅ Players can use `/vmode` and `/vplay`
- ✅ Matchmaking system is active

Your Valorant Discord Bot is now ready to use! 🚀
