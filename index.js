require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const Player = require('./models/Player');
const Match = require('./models/Match');
const Queue = require('./models/Queue');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Global queues to track players with MMR and join time
let globalQueue5v5 = [];
let globalQueue1v1 = [];
let matchmakingTimer5v5 = null;
let matchmakingTimer1v1 = null;
let matchmakingStartTime5v5 = null;
let matchmakingStartTime1v1 = null;

// Timer update intervals
let timerUpdateInterval5v5 = null;
let timerUpdateInterval1v1 = null;

// Function to update search messages with live timer
async function updateSearchMessages() {
  // Update 5v5 search messages
  if (globalQueue5v5.length > 0 && matchmakingStartTime5v5) {
    const elapsedTime = Math.floor((Date.now() - matchmakingStartTime5v5) / 1000);
    const timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    
    // Update all players in 5v5 queue
    for (const queuePlayer of globalQueue5v5) {
      try {
        const player = await Player.findOne({ discordId: queuePlayer.discordId });
        if (player && player.lastSearchMessageId) {
          const message = await client.channels.cache.get(process.env.GUILD_ID)?.messages.fetch(player.lastSearchMessageId);
          if (message) {
            const embed = new EmbedBuilder()
              .setTitle('🔍 Searching for Match!')
              .setDescription(`**Players searching: ${globalQueue5v5.length}**\n**Searching for: ${timeString}**\n\nFinding players with similar MMR...`)
              .addFields(
                {
                  name: '📊 Your Status',
                  value: `**Searching:** ✅ Yes\n**Mode:** Team Battle\n**Current Match:** None`,
                  inline: true
                },
                {
                  name: '🏆 Your Stats',
                  value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
                  inline: true
                }
              )
              .setColor('#00ff00')
              .setTimestamp();

            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('leave_queue')
                  .setLabel('❌ Cancel Search')
                  .setStyle(ButtonStyle.Danger)
              );

            await message.edit({ embeds: [embed], components: [row] });
          }
        }
      } catch (error) {
        console.log(`Could not update search message for ${queuePlayer.discordId}:`, error.message);
      }
    }
  }

  // Update 1v1 search messages
  if (globalQueue1v1.length > 0 && matchmakingStartTime1v1) {
    const elapsedTime = Math.floor((Date.now() - matchmakingStartTime1v1) / 1000);
    const timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    
    // Update all players in 1v1 queue
    for (const queuePlayer of globalQueue1v1) {
      try {
        const player = await Player.findOne({ discordId: queuePlayer.discordId });
        if (player && player.lastSearchMessageId) {
          const message = await client.channels.cache.get(process.env.GUILD_ID)?.messages.fetch(player.lastSearchMessageId);
          if (message) {
            const embed = new EmbedBuilder()
              .setTitle('⚔️ Searching for Duel!')
              .setDescription(`**Players searching: ${globalQueue1v1.length}/2**\n**Searching for: ${timeString}**\n\nFinding a worthy opponent...`)
              .addFields(
                {
                  name: '📊 Your Status',
                  value: `**Searching:** ✅ Yes\n**Mode:** Duel\n**Current Match:** None`,
                  inline: true
                },
                {
                  name: '🏆 Your Stats',
                  value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
                  inline: true
                }
              )
              .setColor('#00ff00')
              .setTimestamp();

            const row = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId('leave_queue')
                  .setLabel('❌ Cancel Search')
                  .setStyle(ButtonStyle.Danger)
              );

            await message.edit({ embeds: [embed], components: [row] });
          }
        }
      } catch (error) {
        console.log(`Could not update search message for ${queuePlayer.discordId}:`, error.message);
      }
    }
  }
}

// Generate unique match ID
function generateMatchId() {
  return 'MATCH_' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Shuffle array function
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Update player rank based on MMR
async function updatePlayerRank(player) {
  player.updateRank();
  await player.save();
}

// Calculate MMR gain/loss based on opponent skill
function calculateMMRChange(playerMMR, opponentMMR, won) {
  const baseMMR = 25; // Base MMR change
  const mmrDifference = opponentMMR - playerMMR;
  
  let multiplier = 1;
  
  if (won) {
    // If you win against higher MMR opponents, gain more
    if (mmrDifference > 0) {
      multiplier = 1 + (mmrDifference / 200); // Up to 2x multiplier for much higher opponents
    } else if (mmrDifference < 0) {
      multiplier = 1 + (mmrDifference / 400); // Reduced gain for lower opponents
    }
  } else {
    // If you lose against higher MMR opponents, lose less
    if (mmrDifference > 0) {
      multiplier = 1 - (mmrDifference / 400); // Reduced loss for higher opponents
    } else if (mmrDifference < 0) {
      multiplier = 1 - (mmrDifference / 200); // More loss for lower opponents
    }
  }
  
  // Ensure multiplier is within reasonable bounds
  multiplier = Math.max(0.1, Math.min(2.0, multiplier));
  
  const mmrChange = Math.round(baseMMR * multiplier);
  return won ? mmrChange : -mmrChange;
}

// Calculate MMR change for 5v5 mode
function calculateMMRChange5v5(playerMMR, opponentMMR, won) {
  return calculateMMRChange(playerMMR, opponentMMR, won);
}

// Calculate MMR change for 1v1 mode
function calculateMMRChange1v1(playerMMR, opponentMMR, won) {
  const baseMMR = 30; // Higher base MMR change for 1v1
  const mmrDifference = opponentMMR - playerMMR;
  
  let multiplier = 1;
  
  if (won) {
    // If you win against higher MMR opponents, gain more
    if (mmrDifference > 0) {
      multiplier = 1 + (mmrDifference / 150); // Higher multiplier for 1v1
    } else if (mmrDifference < 0) {
      multiplier = 1 + (mmrDifference / 300); // Reduced gain for lower opponents
    }
  } else {
    // If you lose against higher MMR opponents, lose less
    if (mmrDifference > 0) {
      multiplier = 1 - (mmrDifference / 300); // Reduced loss for higher opponents
    } else if (mmrDifference < 0) {
      multiplier = 1 - (mmrDifference / 150); // More loss for lower opponents
    }
  }
  
  // Ensure multiplier is within reasonable bounds
  multiplier = Math.max(0.1, Math.min(2.5, multiplier));
  
  const mmrChange = Math.round(baseMMR * multiplier);
  return mmrChange; // Always return positive value, let the caller handle the sign
}

// Calculate average MMR for a team
async function calculateTeamAverageMMR(teamPlayerIds) {
  const players = await Player.find({ discordId: { $in: teamPlayerIds } });
  const totalMMR = players.reduce((sum, player) => sum + player.mmr, 0);
  return totalMMR / players.length;
}

// Calculate average MMR for a team (5v5 mode)
async function calculateTeamAverageMMR5v5(teamPlayerIds) {
  const players = await Player.find({ discordId: { $in: teamPlayerIds } });
  const totalMMR = players.reduce((sum, player) => sum + player.mmr5v5, 0);
  return totalMMR / players.length;
}

// Calculate average MMR for a team (1v1 mode)
async function calculateTeamAverageMMR1v1(teamPlayerIds) {
  const players = await Player.find({ discordId: { $in: teamPlayerIds } });
  const totalMMR = players.reduce((sum, player) => sum + player.mmr1v1, 0);
  return totalMMR / players.length;
}

// Smart matchmaking function for 5v5
function findBalancedMatch5v5(players) {
  if (players.length < 10) return null;
  
  // Sort players by 5v5 MMR
  const sortedPlayers = [...players].sort((a, b) => a.mmr5v5 - b.mmr5v5);
  
  // Try to create balanced teams
  const teamA = [];
  const teamB = [];
  
  // Distribute players alternately to balance MMR
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) {
      teamA.push(sortedPlayers[i]);
    } else {
      teamB.push(sortedPlayers[i]);
    }
  }
  
  // Calculate team average MMRs
  const teamAMMR = teamA.reduce((sum, p) => sum + p.mmr5v5, 0) / 5;
  const teamBMMR = teamB.reduce((sum, p) => sum + p.mmr5v5, 0) / 5;
  
  // Check if teams are balanced (within 100 MMR difference)
  const mmrDifference = Math.abs(teamAMMR - teamBMMR);
  
  if (mmrDifference <= 100) {
    return { teamA: teamA.map(p => p.discordId), teamB: teamB.map(p => p.discordId) };
  }
  
  return null;
}

// Smart matchmaking function for 1v1
function findBalancedMatch1v1(players) {
  if (players.length < 2) return null;
  
  console.log(`findBalancedMatch1v1 called with ${players.length} players:`, players.map(p => ({ discordId: p.discordId, mmr: p.mmr })));
  
  // Sort players by MMR (queue stores mmr property, not mmr1v1)
  const sortedPlayers = [...players].sort((a, b) => a.mmr - b.mmr);
  
  // Find two players with closest MMR
  let bestMatch = null;
  let smallestDifference = Infinity;
  
  for (let i = 0; i < sortedPlayers.length - 1; i++) {
    for (let j = i + 1; j < sortedPlayers.length; j++) {
      const mmrDifference = Math.abs(sortedPlayers[i].mmr - sortedPlayers[j].mmr);
      console.log(`Comparing ${sortedPlayers[i].discordId} (${sortedPlayers[i].mmr}) vs ${sortedPlayers[j].discordId} (${sortedPlayers[j].mmr}) - difference: ${mmrDifference}`);
      if (mmrDifference < smallestDifference) {
        smallestDifference = mmrDifference;
        bestMatch = {
          player1: sortedPlayers[i].discordId,
          player2: sortedPlayers[j].discordId
        };
      }
    }
  }
  
  console.log(`Best match found:`, bestMatch, `with MMR difference: ${smallestDifference}`);
  
  // Only create match if MMR difference is reasonable (within 200 MMR)
  if (bestMatch && smallestDifference <= 200) {
    console.log(`Match approved - MMR difference ${smallestDifference} <= 200`);
    return bestMatch;
  }
  
  console.log(`Match rejected - MMR difference ${smallestDifference} > 200`);
  return null;
}

// Expand matchmaking criteria over time for 5v5
function getMatchmakingCriteria5v5(elapsedMinutes) {
  if (elapsedMinutes < 1) {
    return { maxMMRDiff: 50, minPlayers: 10 };
  } else if (elapsedMinutes < 2) {
    return { maxMMRDiff: 100, minPlayers: 10 };
  } else {
    return { maxMMRDiff: 200, minPlayers: 8 }; // Allow 8+ players after 2 minutes
  }
}

// Expand matchmaking criteria over time for 1v1
function getMatchmakingCriteria1v1(elapsedMinutes) {
  if (elapsedMinutes < 1) {
    return { maxMMRDiff: 50, minPlayers: 2 };
  } else if (elapsedMinutes < 2) {
    return { maxMMRDiff: 100, minPlayers: 2 };
  } else {
    return { maxMMRDiff: 200, minPlayers: 2 }; // Always need 2 players for 1v1
  }
}

// Start matchmaking timer for 5v5
function startMatchmakingTimer5v5() {
  if (matchmakingTimer5v5) return;
  
  matchmakingStartTime5v5 = Date.now();
  
  // Start timer update interval
  timerUpdateInterval5v5 = setInterval(updateSearchMessages, 1000); // Update every second
  
  matchmakingTimer5v5 = setInterval(async () => {
    const elapsedMinutes = (Date.now() - matchmakingStartTime5v5) / (1000 * 60);
    const criteria = getMatchmakingCriteria5v5(elapsedMinutes);
    
    // Try to find a match
    const match = findBalancedMatch5v5(globalQueue5v5);
    
    if (match) {
      // Create match with balanced teams
      await createBalancedMatch5v5(match.teamA, match.teamB);
      clearMatchmakingTimer5v5();
    } else if (globalQueue5v5.length >= criteria.minPlayers && elapsedMinutes >= 2) {
      // Force create match with available players after 2 minutes
      const shuffledPlayers = shuffleArray(globalQueue5v5);
      const teamA = shuffledPlayers.slice(0, 5);
      const teamB = shuffledPlayers.slice(5, 10);
      await createBalancedMatch5v5(teamA, teamB);
      clearMatchmakingTimer5v5();
    }
  }, 10000); // Check every 10 seconds
}

// Start matchmaking timer for 1v1
function startMatchmakingTimer1v1() {
  if (matchmakingTimer1v1) return;
  
  matchmakingStartTime1v1 = Date.now();
  
  // Start timer update interval
  timerUpdateInterval1v1 = setInterval(updateSearchMessages, 1000); // Update every second
  
  matchmakingTimer1v1 = setInterval(async () => {
    const elapsedMinutes = (Date.now() - matchmakingStartTime1v1) / (1000 * 60);
    const criteria = getMatchmakingCriteria1v1(elapsedMinutes);
    
    // Try to find a match
    const match = findBalancedMatch1v1(globalQueue1v1);
    
    if (match) {
      // Create match with balanced players
      await createBalancedMatch1v1(match.player1, match.player2);
      clearMatchmakingTimer1v1();
    } else if (globalQueue1v1.length >= criteria.minPlayers && elapsedMinutes >= 2) {
      // Force create match with available players after 2 minutes
      const shuffledPlayers = shuffleArray(globalQueue1v1);
      const player1 = shuffledPlayers[0];
      const player2 = shuffledPlayers[1];
      await createBalancedMatch1v1(player1.discordId, player2.discordId);
      clearMatchmakingTimer1v1();
    }
  }, 10000); // Check every 10 seconds
}

// Clear matchmaking timer for 5v5
function clearMatchmakingTimer5v5() {
  if (matchmakingTimer5v5) {
    clearInterval(matchmakingTimer5v5);
    matchmakingTimer5v5 = null;
    matchmakingStartTime5v5 = null;
  }
  if (timerUpdateInterval5v5) {
    clearInterval(timerUpdateInterval5v5);
    timerUpdateInterval5v5 = null;
  }
}

// Clear matchmaking timer for 1v1
function clearMatchmakingTimer1v1() {
  if (matchmakingTimer1v1) {
    clearInterval(matchmakingTimer1v1);
    matchmakingTimer1v1 = null;
    matchmakingStartTime1v1 = null;
  }
  if (timerUpdateInterval1v1) {
    clearInterval(timerUpdateInterval1v1);
    timerUpdateInterval1v1 = null;
  }
}

// Create slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Join the Valorant matchmaking queue'),
  
  
  new SlashCommandBuilder()
    .setName('votewin')
    .setDescription('Vote for match winner')
    .addStringOption(option =>
      option.setName('matchid')
        .setDescription('The match ID')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('team')
        .setDescription('Winning team (A or B)')
        .setRequired(true)
        .addChoices(
          { name: 'Team A', value: 'A' },
          { name: 'Team B', value: 'B' }
        )),
  
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show player rank and stats')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check rank for (optional)')
        .setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('matches')
    .setDescription('Show active and recent matches'),
  
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands'),
  
  new SlashCommandBuilder()
    .setName('vmatch')
    .setDescription('Show Valorant matchmaking instructions in Mongolian and English'),
  
  new SlashCommandBuilder()
    .setName('vplay')
    .setDescription('Show interactive queue buttons to join or leave Valorant matchmaking'),
  
  new SlashCommandBuilder()
    .setName('vmode')
    .setDescription('Choose between 1v1 and 5v5 matchmaking modes'),
  
  new SlashCommandBuilder()
    .setName('partycode')
    .setDescription('Submit party code for your match (Host only)')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('The Valorant party code')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('matchid')
        .setDescription('The match ID')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('vsetup')
    .setDescription('Set up dedicated channels for Valorant matchmaking bot (Admin only)'),
  
  new SlashCommandBuilder()
    .setName('cleanparty')
    .setDescription('Clean up non-party-code messages from party-code channel (Admin only)'),
  
];

client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  
  // Register slash commands
  try {
    await client.application.commands.set(commands, process.env.GUILD_ID);
    console.log('Slash commands registered successfully');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    // Handle slash commands
    await handleSlashCommand(interaction);
  } else if (interaction.isButton()) {
    // Handle button interactions
    await handleButtonInteraction(interaction);
  }
});

async function handleSlashCommand(interaction) {

  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'queue':
        await handleQueue(interaction);
        break;
      case 'votewin':
        await handleVoteWin(interaction);
        break;
      case 'rank':
        await handleRank(interaction);
        break;
      case 'matches':
        await handleMatches(interaction);
        break;
      case 'help':
        await handleHelp(interaction);
        break;
      case 'vmatch':
        await handleVmatch(interaction);
        break;
      case 'vplay':
        await handleVplay(interaction);
        break;
      case 'vmode':
        await handleVmode(interaction);
        break;
      case 'partycode':
        await handlePartyCode(interaction);
        break;
      case 'vsetup':
        await handleVsetup(interaction);
        break;
      case 'cleanparty':
        await handleCleanParty(interaction);
        break;
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
  }
}

// Button interaction handler
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;
  
  try {
    switch (customId) {
      case 'join_queue':
        await handleJoinQueueButton(interaction);
        break;
      case 'leave_queue':
        await handleLeaveQueueButton(interaction);
        break;
      case 'mode_5v5':
        await handleMode5v5Button(interaction);
        break;
      case 'mode_1v1':
        await handleMode1v1Button(interaction);
        break;
      case 'quick_start':
        await handleQuickStartButton(interaction);
        break;
      case 'choose_mode':
        await handleChooseModeButton(interaction);
        break;
      case 'check_stats':
        await handleCheckStatsButton(interaction);
        break;
      case 'view_matches':
        await handleViewMatchesButton(interaction);
        break;
      case 'show_help':
        await handleShowHelpButton(interaction);
        break;
      case 'cancel_instructions':
        await handleCancelInstructionsButton(interaction);
        break;
      case 'find_match':
        await handleFindMatchButton(interaction);
        break;
      case 'change_mode':
        await handleChangeModeButton(interaction);
        break;
      default:
        // Handle accept/decline match buttons
        if (customId.startsWith('accept_match_')) {
          await handleAcceptMatchButton(interaction);
        } else if (customId.startsWith('decline_match_')) {
          await handleDeclineMatchButton(interaction);
        } else if (customId.startsWith('send_screenshot_')) {
          await handleScreenshotButton(interaction);
        } else if (customId.startsWith('select_winner_')) {
          await handleSelectWinnerButton(interaction);
        } else if (customId === 'check_my_rank') {
          await handleCheckMyRankButton(interaction);
        } else if (customId === 'clean_party_now') {
          await handleCleanPartyNowButton(interaction);
        }
        break;
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
  }
}

// Vplay command handler
async function handleVplay(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Check if player is already searching
  if (player.isInQueue) {
    // Check which queue the player is in to get correct timer
    const isIn5v5 = globalQueue5v5.some(p => p.discordId === userId);
    const isIn1v1 = globalQueue1v1.some(p => p.discordId === userId);
    
    let elapsedTime = 0;
    let queueLength = 0;
    let mode = '';
    
    if (isIn5v5) {
      elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
      queueLength = globalQueue5v5.length;
      mode = '5v5 Team Battle';
    } else if (isIn1v1) {
      elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
      queueLength = globalQueue1v1.length;
      mode = '1v1 Duel';
    }
    
    const timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';

    const embed = new EmbedBuilder()
      .setTitle('🔍 Already Searching!')
      .setDescription(`**Players searching: ${queueLength}**\n**Searching for: ${timeString}**\n**Mode: ${mode}**\n\nYou are already searching for a match!`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Current Match:** ${player.currentMatchId ? `\`${player.currentMatchId}\`` : 'None'}`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#ffa500')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('leave_queue')
          .setLabel('❌ Cancel Search')
          .setStyle(ButtonStyle.Danger)
      );

    return await interaction.reply({ embeds: [embed], components: [row] });
  }

  // Check if player is in an active match
  if (player.currentMatchId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Already in Match!')
      .setDescription(`You are currently in an active match: \`${player.currentMatchId}\`\n\nPlease finish your current match before searching for a new one.`)
      .setColor('#ff6b6b')
      .setTimestamp();

    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Join queue based on previously selected mode
  player.isInQueue = true;
  await player.save();
  
  let queueLength, elapsedTime, timeString, modeName, embed, findMatchEmbed;
  
  if (player.selectedMode === '1v1') {
    // Join 1v1 queue
    globalQueue1v1.push({
      discordId: userId,
      mmr: player.mmr1v1,
      joinTime: Date.now()
    });

    // Start matchmaking timer if not already running
    if (globalQueue1v1.length === 1) {
      startMatchmakingTimer1v1();
    } else if (globalQueue1v1.length === 2) {
      // Immediately try to match when 2 players are found
      console.log(`2 players found in 1v1 queue, attempting immediate match creation`);
      const match = findBalancedMatch1v1(globalQueue1v1);
      if (match) {
        console.log(`Immediate match created: ${match.player1} vs ${match.player2}`);
        clearMatchmakingTimer1v1();
        await createBalancedMatch1v1(match.player1, match.player2);
        return; // Exit early since match was created
      } else {
        console.log(`No immediate match found for 2 players`);
      }
    }

    elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
    timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    queueLength = globalQueue1v1.length;
    modeName = 'Duel';

    embed = new EmbedBuilder()
      .setTitle('⚔️ Searching for Duel!')
      .setDescription(`**Players searching: ${queueLength}/2**\n**Searching for: ${timeString}**\n\nFinding a worthy opponent...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** Duel\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    findMatchEmbed = new EmbedBuilder()
      .setTitle('⚔️ Queue Joined')
      .setDescription(`**Player:** <@${interaction.user.id}>\n**Action:** Joined matchmaking queue\n**Queue Length:** ${queueLength} players`)
      .addFields(
        {
          name: '📊 Player Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        },
        {
          name: '⏱️ Search Time',
          value: `**Started:** ${timeString}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

  } else {
    // Join 5v5 queue (default)
    globalQueue5v5.push({
      discordId: userId,
      mmr: player.mmr5v5,
      joinTime: Date.now()
    });

    // Start matchmaking timer if not already running
    if (globalQueue5v5.length === 1) {
      startMatchmakingTimer5v5();
    }

    elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
    timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    queueLength = globalQueue5v5.length;
    modeName = 'Team Battle';

    embed = new EmbedBuilder()
      .setTitle('🔍 Searching for Match!')
      .setDescription(`**Players searching: ${queueLength}**\n**Searching for: ${timeString}**\n\nFinding players with similar MMR...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** Team Battle\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    findMatchEmbed = new EmbedBuilder()
      .setTitle('🔍 Matchmaking Update')
      .setDescription(`**Player:** <@${interaction.user.id}>\n**Action:** Started searching for match\n**Queue Length:** ${queueLength} players`)
      .addFields(
        {
          name: '📊 Player Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        },
        {
          name: '⏱️ Search Time',
          value: `**Started:** ${timeString}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('leave_queue')
        .setLabel('❌ Cancel Search')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  // Update status channel only (no public matchmaking messages)
  await updateStatusChannel(interaction.guild);
}

// Vmode command handler
async function handleVmode(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Check if player is already searching
  if (player.isInQueue) {
    // Determine which queue the player is in and get current status
    let queueLength, elapsedTime, timeString, modeName;
    
    if (globalQueue5v5.some(p => p.discordId === userId)) {
      // Player is in 5v5 queue
      elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
      timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
      queueLength = globalQueue5v5.length;
      modeName = 'Team Battle';
    } else if (globalQueue1v1.some(p => p.discordId === userId)) {
      // Player is in 1v1 queue
      elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
      timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
      queueLength = globalQueue1v1.length;
      modeName = 'Duel';
    } else {
      // Fallback (shouldn't happen)
      elapsedTime = 0;
      timeString = '0:00';
      queueLength = 1;
      modeName = 'Match';
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Currently Searching for ${modeName}!`)
      .setDescription(`**Players searching: ${queueLength}${modeName === 'Duel' ? '/2' : ''}**\n**Searching for: ${timeString}**\n\nFinding players with similar MMR...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** ${modeName}\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('leave_queue')
          .setLabel('❌ Cancel Search')
          .setStyle(ButtonStyle.Danger)
      );

    return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Check if player is in an active match
  if (player.currentMatchId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Already in Match!')
      .setDescription(`You are currently in an active match: \`${player.currentMatchId}\`\n\nPlease finish your current match first.`)
      .setColor('#ff6b6b')
      .setTimestamp();

    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🎮 Choose Matchmaking Mode')
    .setDescription('Select your preferred game mode:')
    .addFields(
      {
        name: '🏆 5v5 Team Battle',
        value: 'Classic 5v5 team matches\n**Players needed:** 10\n**Mode:** Team vs Team',
        inline: true
      },
      {
        name: '⚔️ 1v1 Duel',
        value: 'Intense 1v1 duels\n**Players needed:** 2\n**Mode:** Player vs Player',
        inline: true
      }
    )
    .setColor('#ff6b6b')
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('mode_5v5')
        .setLabel('🏆 5v5 Team Battle')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mode_1v1')
        .setLabel('⚔️ 1v1 Duel')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Join queue button handler
async function handleJoinQueueButton(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Check if player is already in queue
  if (player.isInQueue) {
    return await interaction.reply({ content: 'You are already searching for a match!', ephemeral: true });
  }

  // Check if player is in an active match
  if (player.currentMatchId) {
    return await interaction.reply({ content: 'You are currently in an active match!', ephemeral: true });
  }

  // Add player to queue with MMR data
  player.isInQueue = true;
  await player.save();
  globalQueue.push({
    discordId: userId,
    mmr: player.mmr,
    joinTime: Date.now()
  });

  // Start matchmaking timer if not already running
  if (globalQueue.length === 1) {
    startMatchmakingTimer();
  }

  const embed = new EmbedBuilder()
    .setTitle('🔍 Searching for Match!')
    .setDescription(`You are now searching for a balanced match.\n**Players searching: ${globalQueue.length}**\n\nFinding players with similar MMR...`)
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Leave queue button handler
async function handleLeaveQueueButton(interaction) {
  const userId = interaction.user.id;

  // Check if player is in database queue
  const player = await Player.findOne({ discordId: userId });
  if (!player || !player.isInQueue) {
    return await interaction.reply({ content: 'You are not searching for a match!', ephemeral: true });
  }

  // Check which queue the player is in and remove them
  let wasIn5v5 = false;
  let wasIn1v1 = false;
  
  const playerIndex5v5 = globalQueue5v5.findIndex(p => p.discordId === userId);
  if (playerIndex5v5 !== -1) {
    globalQueue5v5.splice(playerIndex5v5, 1);
    wasIn5v5 = true;
  }
  
  const playerIndex1v1 = globalQueue1v1.findIndex(p => p.discordId === userId);
  if (playerIndex1v1 !== -1) {
    globalQueue1v1.splice(playerIndex1v1, 1);
    wasIn1v1 = true;
  }

  // Update player status in database
  await Player.findOneAndUpdate(
    { discordId: userId },
    { isInQueue: false }
  );

  // Clear appropriate timer if no players left
  if (wasIn5v5 && globalQueue5v5.length === 0) {
    clearMatchmakingTimer5v5();
  }
  if (wasIn1v1 && globalQueue1v1.length === 0) {
    clearMatchmakingTimer1v1();
  }

  // Get remaining queue length
  let queueLength = 0;
  if (wasIn5v5) {
    queueLength = globalQueue5v5.length;
  } else if (wasIn1v1) {
    queueLength = globalQueue1v1.length;
  }

  // Try to delete the original search message
  try {
    if (player.lastSearchMessageId) {
      const originalMessage = await interaction.channel.messages.fetch(player.lastSearchMessageId);
      if (originalMessage) {
        await originalMessage.delete();
      }
    }
  } catch (error) {
    console.log('Could not delete original search message:', error.message);
  }

  // Send a simple confirmation that will auto-dismiss
  await interaction.reply({ 
    content: `✅ Search cancelled! Players still searching: ${queueLength}`, 
    ephemeral: true 
  });

  // Clear the stored message ID
  await Player.findOneAndUpdate(
    { discordId: userId },
    { lastSearchMessageId: null }
  );
}

// Mode 5v5 button handler
async function handleMode5v5Button(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Set player mode to 5v5
  player.selectedMode = '5v5';
  await player.save();

  const embed = new EmbedBuilder()
    .setTitle('🏆 5v5 Mode Selected!')
    .setDescription('You have selected **5v5 Team Battle** mode.\n\n**Players needed:** 10\n**Mode:** Team vs Team\n\nClick the button below to start searching for a match!')
    .addFields(
      {
        name: '📊 Your 5v5 Stats',
        value: `**MMR:** ${player.mmr5v5}\n**W/L:** ${player.wins5v5}/${player.losses5v5}`,
        inline: true
      },
      {
        name: '🎯 Next Step',
        value: 'Click "Find Match" to start searching!',
        inline: true
      }
    )
    .setColor('#00ff00')
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('find_match')
        .setLabel('🔍 Find Match')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('change_mode')
        .setLabel('🔄 Change Mode')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Mode 1v1 button handler
async function handleMode1v1Button(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Set player mode to 1v1
  player.selectedMode = '1v1';
  await player.save();

  const embed = new EmbedBuilder()
    .setTitle('⚔️ 1v1 Mode Selected!')
    .setDescription('You have selected **1v1 Duel** mode.\n\n**Players needed:** 2\n**Mode:** Player vs Player\n\nClick the button below to start searching for a match!')
    .addFields(
      {
        name: '📊 Your 1v1 Stats',
        value: `**MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins1v1}/${player.losses1v1}`,
        inline: true
      },
      {
        name: '🎯 Next Step',
        value: 'Click "Find Match" to start searching!',
        inline: true
      }
    )
    .setColor('#ff6b6b')
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('find_match')
        .setLabel('🔍 Find Match')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('change_mode')
        .setLabel('🔄 Change Mode')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Queue command handler
async function handleQueue(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Check if player is already in queue
  if (player.isInQueue) {
    return await interaction.reply({ content: 'You are already in the queue!', ephemeral: true });
  }

  // Check if player is in an active match
  if (player.currentMatchId) {
    return await interaction.reply({ content: 'You are currently in an active match!', ephemeral: true });
  }

  // Add player to 5v5 queue (legacy queue command defaults to 5v5)
  player.isInQueue = true;
  await player.save();
  globalQueue5v5.push({
    discordId: userId,
    mmr: player.mmr,
    joinTime: Date.now()
  });

  const embed = new EmbedBuilder()
    .setTitle('🎮 Queue Joined!')
    .setDescription(`You have joined the 5v5 matchmaking queue.\nPlayers in queue: ${globalQueue5v5.length}/10`)
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  // Start matchmaking timer if not already running
  if (globalQueue5v5.length === 1) {
    startMatchmakingTimer5v5();
  }
}

// Create balanced match
async function createBalancedMatch(teamA, teamB) {
  const matchId = generateMatchId();

  // Create match in database
  const match = new Match({
    matchId: matchId,
    hostId: teamA[0], // First player becomes host
    teamA: teamA,
    teamB: teamB,
    status: 'active'
  });
  await match.save();

  // Update players
  for (const playerId of teamA.concat(teamB)) {
    await Player.findOneAndUpdate(
      { discordId: playerId },
      { 
        isInQueue: false,
        currentMatchId: matchId
      }
    );
  }

  // Remove matched players from queue
  globalQueue = globalQueue.filter(p => !teamA.includes(p.discordId) && !teamB.includes(p.discordId));

  // Calculate team average MMRs for display
  const teamAPlayers = await Player.find({ discordId: { $in: teamA } });
  const teamBPlayers = await Player.find({ discordId: { $in: teamB } });
  const teamAMMR = Math.round(teamAPlayers.reduce((sum, p) => sum + p.mmr, 0) / 5);
  const teamBMMR = Math.round(teamBPlayers.reduce((sum, p) => sum + p.mmr, 0) / 5);

  // Create match announcement embed
  const embed = new EmbedBuilder()
    .setTitle('⚔️ Match Found!')
    .setDescription(`**Match ID:** ${matchId}\n**Status:** Active\n**Balanced Teams Created**`)
    .addFields(
      {
        name: `🔵 Team A (Avg MMR: ${teamAMMR})`,
        value: teamA.map(id => `<@${id}>`).join('\n'),
        inline: true
      },
      {
        name: `🔴 Team B (Avg MMR: ${teamBMMR})`,
        value: teamB.map(id => `<@${id}>`).join('\n'),
        inline: true
      }
    )
    .setColor('#00ff00')
    .setTimestamp();

  // Send to a general channel or DM the first player
  try {
    const firstPlayer = await client.users.fetch(teamA[0]);
    await firstPlayer.send({ embeds: [embed] });
  } catch (error) {
    console.log('Could not send match notification:', error.message);
  }
}

// Create match when queue is full (legacy function)
async function createMatch(interaction) {
  const shuffledPlayers = shuffleArray(globalQueue5v5);
  const teamA = shuffledPlayers.slice(0, 5);
  const teamB = shuffledPlayers.slice(5, 10);

  await createBalancedMatch5v5(teamA, teamB);

  // Create match announcement embed
  const embed = new EmbedBuilder()
    .setTitle('⚔️ Match Created!')
    .setDescription(`**Status:** Active\n**Mode:** 5v5 Team Battle`)
    .setColor('#0099ff')
    .setTimestamp();

  await interaction.followUp({ embeds: [embed] });
}

// Create balanced 5v5 match
async function createBalancedMatch5v5(teamA, teamB) {
  const matchId = generateMatchId();
  
  // Create match in database with pending status
  const match = new Match({
    matchId: matchId,
    teamA: teamA,
    teamB: teamB,
    status: 'pending',
    matchType: '5v5',
    acceptDeadline: new Date(Date.now() + 60000) // 60 seconds to accept
  });
  await match.save();

  // Update players
  for (const playerId of teamA.concat(teamB)) {
    await Player.findOneAndUpdate(
      { discordId: playerId },
      { 
        isInQueue: false,
        currentMatchId: matchId
      }
    );
  }

  // Remove matched players from queue
  globalQueue5v5 = globalQueue5v5.filter(p => !teamA.includes(p.discordId) && !teamB.includes(p.discordId));

  // Calculate team average MMRs for display
  const teamAPlayers = await Player.find({ discordId: { $in: teamA } });
  const teamBPlayers = await Player.find({ discordId: { $in: teamB } });
  const teamAMMR = Math.round(teamAPlayers.reduce((sum, p) => sum + p.mmr5v5, 0) / 5);
  const teamBMMR = Math.round(teamBPlayers.reduce((sum, p) => sum + p.mmr5v5, 0) / 5);

  // Send Accept/Decline messages to all players
  const allPlayers = teamA.concat(teamB);
  for (const playerId of allPlayers) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 5v5 Team Battle Found!')
      .setDescription(`**Match ID:** ${matchId}\n**Status:** Pending Acceptance\n**Mode:** 5v5 Team Battle\n\n**Time Limit:** 60 seconds\n\n**Your Team:** ${teamA.includes(playerId) ? 'Team A' : 'Team B'}\n\nPlease accept or decline this match within 60 seconds!`)
      .addFields(
        {
          name: `🔵 Team A (Avg MMR: ${teamAMMR})`,
          value: teamA.map(id => `<@${id}>`).join('\n'),
          inline: true
        },
        {
          name: `🔴 Team B (Avg MMR: ${teamBMMR})`,
          value: teamB.map(id => `<@${id}>`).join('\n'),
          inline: true
        }
      )
      .setColor('#ffd700')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_match_${matchId}_${playerId}`)
          .setLabel('✅ Accept Match')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`decline_match_${matchId}_${playerId}`)
          .setLabel('❌ Decline Match')
          .setStyle(ButtonStyle.Danger)
      );

    try {
      const player = await client.users.fetch(playerId);
      await player.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.log(`Could not send match invitation to ${playerId}:`, error.message);
    }
  }

  // Send public announcement to find-match-5v5 channel
  try {
    const guild = client.guilds.cache.first();
    if (guild) {
      const findMatchCh = guild.channels.cache.find(channel => 
        channel.name === 'find-match-5v5' || channel.name === '🏆 find-match-5v5'
      );
      
      if (findMatchCh) {
        const publicEmbed = new EmbedBuilder()
          .setTitle('🏆 5v5 Team Battle Found!')
          .setDescription(`**Match ID:** ${matchId}\n**Status:** Pending Acceptance\n**Mode:** 5v5 Team Battle\n\n**Players:** ${allPlayers.length}/10\n\nWaiting for all players to accept...`)
          .addFields(
            {
              name: `🔵 Team A (Avg MMR: ${teamAMMR})`,
              value: teamA.map(id => `<@${id}>`).join('\n'),
              inline: true
            },
            {
              name: `🔴 Team B (Avg MMR: ${teamBMMR})`,
              value: teamB.map(id => `<@${id}>`).join('\n'),
              inline: true
            }
          )
          .setColor('#ffd700')
          .setTimestamp();

        await findMatchCh.send({ embeds: [publicEmbed] });
      }
    }
  } catch (error) {
    console.log('Could not send public 5v5 match announcement:', error.message);
  }

  // Set timeout to auto-cancel match if not accepted within 60 seconds
  setTimeout(async () => {
    const currentMatch = await Match.findOne({ matchId: matchId });
    if (currentMatch && currentMatch.status === 'pending') {
      // Cancel the match
      currentMatch.status = 'cancelled';
      await currentMatch.save();

      // Notify all players
      for (const playerId of allPlayers) {
        try {
          const player = await client.users.fetch(playerId);
          await player.send({
            content: `❌ **5v5 Match Cancelled!**\n\n**Match ID:** ${matchId}\n**Reason:** Not all players accepted within the time limit.\n\nYou can search for a new match anytime!`,
            ephemeral: true
          });
        } catch (error) {
          console.log(`Could not send cancellation notice to ${playerId}:`, error.message);
        }
      }

      // Update status channel
      const guild = client.guilds.cache.first();
      if (guild) {
        await updateStatusChannel(guild);
      }
    }
  }, 60000); // 60 seconds

  console.log(`5v5 match created (pending): ${matchId} with teams A: ${teamA.join(', ')} and B: ${teamB.join(', ')}`);
}

// Create balanced 1v1 match
async function createBalancedMatch1v1(player1Id, player2Id) {
  const matchId = generateMatchId();
  
  // Create match in database with accept/decline system
  const match = new Match({
    matchId: matchId,
    hostId: null, // Will be set when both players accept
    teamA: [player1Id],
    teamB: [player2Id],
    status: 'pending', // Changed to pending until both accept
    hostInstructions: '1v1',
    matchType: '1v1',
    player1Accepted: false,
    player2Accepted: false,
    acceptDeadline: new Date(Date.now() + 30000) // 30 seconds from now
  });
  await match.save();

  // Update players
  for (const playerId of [player1Id, player2Id]) {
    await Player.findOneAndUpdate(
      { discordId: playerId },
      { 
        isInQueue: false,
        currentMatchId: matchId
      }
    );
  }

  // Remove matched players from queue
  globalQueue1v1 = globalQueue1v1.filter(p => p.discordId !== player1Id && p.discordId !== player2Id);

  // Get player MMRs for display
  const player1 = await Player.findOne({ discordId: player1Id });
  const player2 = await Player.findOne({ discordId: player2Id });

  // Send accept/decline messages to both players
  for (const playerId of [player1Id, player2Id]) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ 1v1 Duel Found!')
      .setDescription(`**Match ID:** ${matchId}\n**Status:** Pending Acceptance\n**Mode:** 1v1 Deathmatch\n\n**Opponent:** <@${playerId === player1Id ? player2Id : player1Id}>\n**Time Limit:** 30 seconds\n\n**Match Details:**\n• Map: Ascent\n• Mode: Deathmatch\n• Win Condition: Most kills wins\n\nPlease accept or decline this match within 30 seconds!`)
      .addFields(
        {
          name: `🥊 Player 1 (MMR: ${player1.mmr1v1})`,
          value: `<@${player1Id}>`,
          inline: true
        },
        {
          name: `🥊 Player 2 (MMR: ${player2.mmr1v1})`,
          value: `<@${player2Id}>`,
          inline: true
        }
      )
      .setColor('#ffa500')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`accept_match_${matchId}`)
          .setLabel('✅ Accept Match')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`decline_match_${matchId}`)
          .setLabel('❌ Decline Match')
          .setStyle(ButtonStyle.Danger)
      );

    try {
      const player = await client.users.fetch(playerId);
      await player.send({ embeds: [embed], components: [row] });
    } catch (error) {
      console.log(`Could not send match notification to ${playerId}:`, error.message);
    }
  }

  // Send announcement to 1v1 find-match channel if it exists
  try {
    const findMatchCh = await findMatch1v1Channel(client.guilds.cache.first());
    if (findMatchCh) {
      const publicEmbed = new EmbedBuilder()
        .setTitle('⚔️ 1v1 Duel Found!')
        .setDescription(`**Match ID:** ${matchId}\n**Status:** Pending Acceptance\n**Mode:** 1v1 Deathmatch\n\n**Players:** <@${player1Id}> vs <@${player2Id}>\n\nWaiting for both players to accept...`)
        .addFields(
          {
            name: `🥊 Player 1 (MMR: ${player1.mmr1v1})`,
            value: `<@${player1Id}>`,
            inline: true
          },
          {
            name: `🥊 Player 2 (MMR: ${player2.mmr1v1})`,
            value: `<@${player2Id}>`,
            inline: true
          }
        )
        .setColor('#ffa500')
        .setTimestamp();

      await findMatchCh.send({ embeds: [publicEmbed] });
    }
  } catch (error) {
    console.log('Could not send match announcement to find-match channel:', error.message);
  }

  // Start 30-second timer for auto-decline
  setTimeout(async () => {
    const currentMatch = await Match.findOne({ matchId: matchId });
    if (currentMatch && currentMatch.status === 'pending') {
      // Auto-decline if not both accepted
      await Match.findOneAndUpdate(
        { matchId: matchId },
        { status: 'cancelled' }
      );

      // Reset players
      for (const playerId of [player1Id, player2Id]) {
        await Player.findOneAndUpdate(
          { discordId: playerId },
          { 
            isInQueue: false,
            currentMatchId: null
          }
        );
      }

      // Notify players of auto-cancellation
      for (const playerId of [player1Id, player2Id]) {
        const embed = new EmbedBuilder()
          .setTitle('⏰ Match Timeout')
          .setDescription(`**Match ID:** ${matchId}\n**Status:** Cancelled\n\nMatch was cancelled due to timeout. One or both players did not accept within 30 seconds.`)
          .setColor('#ff6b6b')
          .setTimestamp();

        try {
          const player = await client.users.fetch(playerId);
          await player.send({ embeds: [embed] });
        } catch (error) {
          console.log(`Could not send timeout notification to ${playerId}:`, error.message);
        }
      }

      // Update status channel
      await updateStatusChannel(client.guilds.cache.first());
    }
  }, 30000);

  // Update status channel
  await updateStatusChannel(client.guilds.cache.first());
}

// Helper function to find the find-match channel
async function findMatchChannel(guild) {
  if (!guild) return null;
  
  // Look for channel named "find-match" or "🔍 find-match"
  const channel = guild.channels.cache.find(ch => 
    ch.name === 'find-match' || 
    ch.name === '🔍 find-match' ||
    ch.name.toLowerCase().includes('find-match')
  );
  
  return channel;
}

// Helper function to find the 5v5 find-match channel
async function findMatch5v5Channel(guild) {
  if (!guild) return null;
  
  const channel = guild.channels.cache.find(ch => 
    ch.name === 'find-match-5v5' ||
    ch.name === '🏆 find-match-5v5'
  );
  
  return channel;
}

// Helper function to find the 1v1 find-match channel
async function findMatch1v1Channel(guild) {
  if (!guild) return null;
  
  const channel = guild.channels.cache.find(ch => 
    ch.name === 'find-match-1v1' ||
    ch.name === '⚔️ find-match-1v1'
  );
  
  return channel;
}

// Helper function to find the status channel
async function findStatusChannel(guild) {
  if (!guild) return null;
  
  // Look for channel named "status" or "📊 status"
  const channel = guild.channels.cache.find(ch => 
    ch.name === 'status' || 
    ch.name === '📊 status' ||
    ch.name.toLowerCase().includes('status')
  );
  
  return channel;
}

// Update status channel with player stats and match history
async function updateStatusChannel(guild) {
  try {
    const statusCh = await findStatusChannel(guild);
    if (!statusCh) return;

    // Get top players for both modes
    const topPlayers5v5 = await Player.find({}).sort({ mmr5v5: -1 }).limit(5);
    const topPlayers1v1 = await Player.find({}).sort({ mmr1v1: -1 }).limit(5);
    
    // Get recent matches
    const recentMatches = await Match.find({ status: { $in: ['active', 'finished'] } })
      .sort({ createdAt: -1 })
      .limit(10);

    // Get queue statistics
    const queue5v5Count = globalQueue5v5.length;
    const queue1v1Count = globalQueue1v1.length;
    const totalSearching = queue5v5Count + queue1v1Count;

    // Create status embed
    const statusEmbed = new EmbedBuilder()
      .setTitle('📊 Bot Status & Statistics')
      .setDescription('Real-time matchmaking and player statistics')
      .addFields(
        {
          name: '🔍 Current Queues',
          value: `**5v5 Queue:** ${queue5v5Count}/10 players\n**1v1 Queue:** ${queue1v1Count}/2 players\n**Total Searching:** ${totalSearching} players`,
          inline: true
        },
        {
          name: '⏱️ Search Times',
          value: `**5v5:** ${matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0}s\n**1v1:** ${matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0}s`,
          inline: true
        },
        {
          name: '🏆 Top 5v5 Players',
          value: topPlayers5v5.map((p, i) => `${i + 1}. <@${p.discordId}> - **${p.mmr5v5}** MMR`).join('\n') || 'No players yet',
          inline: true
        },
        {
          name: '⚔️ Top 1v1 Players',
          value: topPlayers1v1.map((p, i) => `${i + 1}. <@${p.discordId}> - **${p.mmr1v1}** MMR`).join('\n') || 'No players yet',
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    // Add recent matches if any
    if (recentMatches.length > 0) {
      const matchInfo = recentMatches.slice(0, 3).map(match => {
        const status = match.status === 'active' ? '🟢' : '🔴';
        const winner = match.winner ? ` (Winner: Team ${match.winner})` : '';
        return `${status} **${match.matchId}** - ${match.teamA.length}v${match.teamB.length}${winner}`;
      }).join('\n');

      statusEmbed.addFields({
        name: '🏆 Recent Matches',
        value: matchInfo,
        inline: false
      });
    }

    // Send or update status message
    const messages = await statusCh.messages.fetch({ limit: 1 });
    if (messages.size > 0) {
      await messages.first().edit({ embeds: [statusEmbed] });
    } else {
      await statusCh.send({ embeds: [statusEmbed] });
    }

  } catch (error) {
    console.log('Could not update status channel:', error.message);
  }
}

// Send host instructions
async function sendHostInstructions(hostId, matchId, mode) {
  const instructions = mode === '5v5' ? 
    `🏆 **5v5 Team Battle Host Instructions**

**Match ID:** ${matchId}

**Your Responsibilities:**
1. 🚫 **No Cheating Policy** - Ensure fair play and report any suspicious behavior
2. 🏟️ **Tournament Mode** - Turn on tournament mode in Valorant settings
3. 🗺️ **Random Map** - Choose a random map for this match
4. 👥 **Create Lobby** - Create a custom game lobby
5. 📝 **Share Party Code** - Type the party code in chat or use \`/partycode code:<code> matchID:${matchId}\`

**Steps:**
1. Open Valorant
2. Go to Play → Custom Game
3. Create a new custom game
4. Set up the lobby with tournament mode
5. Choose a random map
6. Copy the party code
7. Use the command above to share it with other players

**Important:** Only you can submit the party code for this match.` :
    `⚔️ **1v1 Deathmatch Host Instructions**

**Match ID:** ${matchId}

**Your Responsibilities:**
1. 🚫 **No Cheating Policy** - Ensure fair play and report any suspicious behavior
2. 🏟️ **Tournament Mode** - Turn on tournament mode in Valorant settings
3. 🗺️ **Map: Ascent** - Use Ascent map for this deathmatch
4. 🎯 **Mode: Deathmatch** - Set game mode to Deathmatch
5. 👥 **Create Lobby** - Create a custom game lobby
6. 📝 **Share Party Code** - Type the party code in chat or use \`/partycode code:<code> matchID:${matchId}\`

**Match Settings:**
- **Map:** Ascent
- **Mode:** Deathmatch
- **Win Condition:** Most kills wins
- **Players:** 2 (1v1)

**Steps:**
1. Open Valorant
2. Go to Play → Custom Game
3. Create a new custom game
4. Set up the lobby with tournament mode
5. Select **Ascent** map
6. Set game mode to **Deathmatch**
7. Copy the party code
8. Use the command above to share it with other players

**Important:** Only you can submit the party code for this match.`;

  const embed = new EmbedBuilder()
    .setTitle(`🎮 Host Instructions - ${mode === '5v5' ? '5v5 Team Battle' : '1v1 Deathmatch'}`)
    .setDescription(instructions)
    .setColor('#ffd700')
    .setTimestamp();

  try {
    const host = await client.users.fetch(hostId);
    await host.send({ embeds: [embed] });
  } catch (error) {
    console.log(`Could not send host instructions to ${hostId}:`, error.message);
  }
}

// Party code command handler
async function handlePartyCode(interaction) {
  const partyCode = interaction.options.getString('code');
  const matchId = interaction.options.getString('matchid');
  const userId = interaction.user.id;

  // Find the match
  const match = await Match.findOne({ matchId: matchId });
  if (!match) {
    return await interaction.reply({ content: 'Match not found!', ephemeral: true });
  }

  // Check if user is the host
  if (match.hostId !== userId) {
    return await interaction.reply({ content: 'Only the match host can submit the party code!', ephemeral: true });
  }

  // Check if match is active
  if (match.status !== 'active') {
    return await interaction.reply({ content: 'This match is not active!', ephemeral: true });
  }

  // Update match with party code
  match.partyCode = partyCode;
  await match.save();

  // Get all players in the match
  const allPlayers = [...match.teamA, ...match.teamB];
  const mode = match.hostInstructions === '5v5' ? '5v5 Team Battle' : '1v1 Duel';

  // Send party code to all players
  for (const playerId of allPlayers) {
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Party Code Received - ${mode}`)
      .setDescription(`**Match ID:** ${matchId}\n**Party Code:** \`${partyCode}\`\n\n**Instructions:**\n1. Open Valorant\n2. Go to Play → Custom Game\n3. Click "Join Party"\n4. Enter the party code: \`${partyCode}\`\n5. Join the lobby and wait for the host to start the match`)
      .setColor('#00ff00')
      .setTimestamp();

    try {
      const player = await client.users.fetch(playerId);
      await player.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send party code to ${playerId}:`, error.message);
    }
  }

  // Confirm to host
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Party Code Submitted!')
    .setDescription(`**Match ID:** ${matchId}\n**Party Code:** \`${partyCode}\`\n\nAll players have been notified of the party code.`)
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
}


// Vote win command handler
async function handleVoteWin(interaction) {
  const matchId = interaction.options.getString('matchid');
  const team = interaction.options.getString('team');
  const userId = interaction.user.id;

  const match = await Match.findOne({ matchId: matchId });
  if (!match) {
    return await interaction.reply({ content: 'Match not found!', ephemeral: true });
  }

  // Check if user is in the match
  if (!match.teamA.includes(userId) && !match.teamB.includes(userId)) {
    return await interaction.reply({ content: 'You are not part of this match!', ephemeral: true });
  }

  // Check if match is active
  if (match.status !== 'active') {
    return await interaction.reply({ content: 'This match is not active!', ephemeral: true });
  }

  // Check if user already voted
  const existingVote = match.votes.find(vote => vote.playerId === userId);
  if (existingVote) {
    return await interaction.reply({ content: 'You have already voted for this match!', ephemeral: true });
  }

  // Add vote
  match.votes.push({
    playerId: userId,
    team: team
  });
  await match.save();

  // Check if majority agrees
  const totalPlayers = match.teamA.length + match.teamB.length;
  const votesForA = match.votes.filter(vote => vote.team === 'A').length;
  const votesForB = match.votes.filter(vote => vote.team === 'B').length;

  if (votesForA > totalPlayers / 2) {
    await finalizeMatch(match, 'A', interaction);
  } else if (votesForB > totalPlayers / 2) {
    await finalizeMatch(match, 'B', interaction);
  } else {
    const embed = new EmbedBuilder()
      .setTitle('🗳️ Vote Recorded!')
      .setDescription(`Vote for Team ${team} recorded.\nVotes: Team A (${votesForA}) vs Team B (${votesForB})`)
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}

// Finalize match based on votes
async function finalizeMatch(match, winner, interaction) {
  match.winner = winner;
  match.status = 'finished';
  match.finishedAt = new Date();
  await match.save();

  // Determine match mode based on team sizes
  const is1v1 = match.teamA.length === 1 && match.teamB.length === 1;
  const matchMode = is1v1 ? '1v1' : '5v5';
  
  // Calculate team average MMRs
  const winners = winner === 'A' ? match.teamA : match.teamB;
  const losers = winner === 'A' ? match.teamB : match.teamA;
  
  let winnersAvgMMR, losersAvgMMR;
  if (is1v1) {
    winnersAvgMMR = await calculateTeamAverageMMR1v1(winners);
    losersAvgMMR = await calculateTeamAverageMMR1v1(losers);
  } else {
    winnersAvgMMR = await calculateTeamAverageMMR5v5(winners);
    losersAvgMMR = await calculateTeamAverageMMR5v5(losers);
  }

  // Update winner stats
  for (const playerId of winners) {
    const player = await Player.findOne({ discordId: playerId });
    if (player) {
      let mmrChange;
      if (is1v1) {
        mmrChange = calculateMMRChange1v1(player.mmr1v1, losersAvgMMR, true);
        player.wins1v1 += 1;
        player.mmr1v1 = Math.max(250, player.mmr1v1 + mmrChange);
        player.updateRank1v1();
      } else {
        mmrChange = calculateMMRChange5v5(player.mmr5v5, losersAvgMMR, true);
        player.wins5v5 += 1;
        player.mmr5v5 = Math.max(250, player.mmr5v5 + mmrChange);
        player.updateRank5v5();
      }
      // Update legacy fields for backward compatibility
      player.wins += 1;
      player.mmr = is1v1 ? player.mmr1v1 : player.mmr5v5;
      player.currentMatchId = null;
      await player.save();
    }
  }

  // Update loser stats
  for (const playerId of losers) {
    const player = await Player.findOne({ discordId: playerId });
    if (player) {
      let mmrChange;
      if (is1v1) {
        mmrChange = calculateMMRChange1v1(player.mmr1v1, winnersAvgMMR, false);
        player.losses1v1 += 1;
        player.mmr1v1 = Math.max(250, player.mmr1v1 + mmrChange);
        player.updateRank1v1();
      } else {
        mmrChange = calculateMMRChange5v5(player.mmr5v5, winnersAvgMMR, false);
        player.losses5v5 += 1;
        player.mmr5v5 = Math.max(250, player.mmr5v5 + mmrChange);
        player.updateRank5v5();
      }
      // Update legacy fields for backward compatibility
      player.losses += 1;
      player.mmr = is1v1 ? player.mmr1v1 : player.mmr5v5;
      player.currentMatchId = null;
      await player.save();
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Match Finished by Vote!')
    .setDescription(`**Match ID:** ${match.matchId}\n**Winner:** Team ${winner}\n**Decided by:** Majority vote`)
    .setColor('#ffd700')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Rank command handler
async function handleRank(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const userId = targetUser.id;

  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: targetUser.username,
      mmr: 250
    });
    await player.save();
  }

  const winRate5v5 = player.wins5v5 + player.losses5v5 > 0 ? Math.round((player.wins5v5 / (player.wins5v5 + player.losses5v5)) * 100) : 0;
  const winRate1v1 = player.wins1v1 + player.losses1v1 > 0 ? Math.round((player.wins1v1 / (player.wins1v1 + player.losses1v1)) * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${targetUser.username}'s Stats`)
    .addFields(
      { 
        name: '🏆 5v5 Team Battle', 
        value: `**MMR:** ${player.mmr5v5}\n**W/L:** ${player.wins5v5}/${player.losses5v5}\n**Win Rate:** ${winRate5v5}%`, 
        inline: true 
      },
      { 
        name: '⚔️ 1v1 Duel', 
        value: `**MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins1v1}/${player.losses1v1}\n**Win Rate:** ${winRate1v1}%`, 
        inline: true 
      },
      { 
        name: '📈 Overall', 
        value: `**Total Wins:** ${player.wins5v5 + player.wins1v1}\n**Total Losses:** ${player.losses5v5 + player.losses1v1}\n**Current Match:** ${player.currentMatchId ? `\`${player.currentMatchId}\`` : 'None'}`, 
        inline: false 
      }
    )
    .setColor('#0099ff')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Matches command handler
async function handleMatches(interaction) {
  const activeMatches = await Match.find({ status: 'active' }).sort({ createdAt: -1 }).limit(5);
  const recentMatches = await Match.find({ status: 'finished' }).sort({ finishedAt: -1 }).limit(5);

  const embed = new EmbedBuilder()
    .setTitle('🎮 Match History')
    .setColor('#0099ff')
    .setTimestamp();

  if (activeMatches.length > 0) {
    const activeList = activeMatches.map(match => 
      `**${match.matchId}** - Team A vs Team B`
    ).join('\n');
    embed.addFields({ name: '🟢 Active Matches', value: activeList, inline: false });
  }

  if (recentMatches.length > 0) {
    const recentList = recentMatches.map(match => 
      `**${match.matchId}** - Winner: Team ${match.winner}`
    ).join('\n');
    embed.addFields({ name: '🔴 Recent Matches', value: recentList, inline: false });
  }

  if (activeMatches.length === 0 && recentMatches.length === 0) {
    embed.setDescription('No matches found.');
  }

  await interaction.reply({ embeds: [embed] });
}

// Help command handler
async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🤖 Valorant Matchmaking Bot Commands')
    .setDescription('Here are all available commands:')
    .addFields(
      {
        name: '/queue',
        value: 'Join the matchmaking queue. When 10 players join, a match will be created automatically.',
        inline: false
      },
      {
        name: '/votewin matchID=<id> team=<A/B>',
        value: 'Vote for the winner of a match. If majority agrees, the match will be finalized.',
        inline: false
      },
      {
        name: '/rank [@user]',
        value: 'Show player stats including rank, points, and win/loss ratio.',
        inline: false
      },
      {
        name: '/matches',
        value: 'Show active and recent matches with their status and winners.',
        inline: false
      },
      {
        name: '/help',
        value: 'Show this help message.',
        inline: false
      },
      {
        name: '/vmatch',
        value: 'Show detailed instructions in Mongolian and English.',
        inline: false
      },
      {
        name: '/vplay',
        value: 'Automatically start searching for a Valorant match with similar MMR players.',
        inline: false
      },
      {
        name: '/vmode',
        value: 'Choose between 1v1 and 5v5 matchmaking modes.',
        inline: false
      },
      {
        name: '/partycode',
        value: 'Submit party code for your match (Host only).',
        inline: false
      },
        {
          name: '/vsetup',
          value: 'Set up dedicated channels for the bot (Admin only).',
          inline: false
        },
        {
          name: '/cleanparty',
          value: 'Clean up non-party-code messages from party-code channel (Admin only).',
          inline: false
        }
    )
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Vmatch command handler
async function handleVmatch(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎮 Valorant Matchmaking Bot - Зааварчилгаа / Instructions')
    .setDescription('**Монгол хэл / Mongolian**\n\n**Англи хэл / English**')
    .addFields(
      {
        name: '🇲🇳 Монгол хэл / Mongolian',
        value: `**1. Тоглогч бүртгэх / Register Players**
• \`/queue\` - Тоглоомын дараалалд бүртгэх
• \`/vplay\` - Автоматаар тоглоом хайх
• \`/vmode\` - 1v1 эсвэл 5v5 горим сонгох
• 10 тоглогч бүртгэгдэхэд автоматаар тоглоом эхлэнэ

**2. Тоглоом удирдах / Manage Matches**
• Winner selection buttons - Зөвхөн хост ашиглаж болно
• \`/votewin matchID=<id> team=<A/B>\` - Тоглогчид санал өгөх

**3. Статистик харах / View Stats**
• \`/rank\` - Өөрийн статистик харах
• \`/rank @хэрэглэгч\` - Бусад хэрэглэгчийн статистик
• \`/matches\` - Идэвхтэй болон сүүлийн тоглоомууд

**4. Тусламж / Help**
• \`/help\` - Бүх команд харах
• \`/vmatch\` - Энэ зааварчилгаа харах`,
        inline: false
      },
      {
        name: '🇺🇸 English',
        value: `**1. Register Players**
• \`/queue\` - Join the matchmaking queue
• \`/vplay\` - Automatically start searching for match
• \`/vmode\` - Choose between 1v1 and 5v5 modes
• When 10 players join, a match starts automatically

**2. Manage Matches**
• Winner selection buttons - Host only
• \`/votewin matchID=<id> team=<A/B>\` - Players can vote

**3. View Stats**
• \`/rank\` - View your own stats
• \`/rank @user\` - View other player's stats
• \`/matches\` - View active and recent matches

**4. Help**
• \`/help\` - Show all commands
• \`/vmatch\` - Show this instruction`,
        inline: false
      },
      {
        name: '🏆 MMR System / MMR систем',
        value: `**English:** Pure MMR numbers - no rank names
**Монгол:** Зөвхөн MMR тоо - ямар ч цол байхгүй

**MMR:** Starts at 250, gains/losses based on opponent skill
**MMR:** 250-аас эхлэх, өрсөлдөгчийн чанараас хамаарч өөрчлөгдөх

**Higher MMR = Better Player / Өндөр MMR = Сайн тоглогч**`,
        inline: false
      },
      {
        name: '⚡ Quick Start / Хурдан эхлэх',
        value: `1. \`/vmode\` - Choose mode / Горим сонгох
2. Wait for players / Тоглогч хүлээх
3. Match starts automatically / Тоглоом автоматаар эхлэх
4. Use winner selection buttons or \`/votewin\` / Ялагч сонгох товч эсвэл \`/votewin\` ашиглах`,
        inline: false
      }
    )
    .setColor('#ff6b6b')
    .setThumbnail('https://images-ext-2.discordapp.net/external/your-valorant-logo-url')
    .setFooter({ text: 'Valorant Matchmaking Bot | Тоглоомын бот' })
    .setTimestamp();

  // Create interactive buttons
  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('quick_start')
        .setLabel('🚀 Quick Start')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('choose_mode')
        .setLabel('🎯 Choose Mode')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('check_stats')
        .setLabel('📊 Check Stats')
        .setStyle(ButtonStyle.Success)
    );

  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('view_matches')
        .setLabel('🏆 View Matches')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('show_help')
        .setLabel('❓ Show Help')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('cancel_instructions')
        .setLabel('❌ Close')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.reply({ 
    embeds: [embed], 
    components: [row1, row2] 
  });
}

// Button handlers for vmatch command
async function handleQuickStartButton(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Check if player is already searching
  if (player.isInQueue) {
    // Determine which queue the player is in and get current status
    let queueLength, elapsedTime, timeString, modeName;
    
    if (globalQueue5v5.some(p => p.discordId === userId)) {
      // Player is in 5v5 queue
      elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
      timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
      queueLength = globalQueue5v5.length;
      modeName = 'Team Battle';
    } else if (globalQueue1v1.some(p => p.discordId === userId)) {
      // Player is in 1v1 queue
      elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
      timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
      queueLength = globalQueue1v1.length;
      modeName = 'Duel';
    } else {
      // Fallback (shouldn't happen)
      elapsedTime = 0;
      timeString = '0:00';
      queueLength = 1;
      modeName = 'Match';
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Currently Searching for ${modeName}!`)
      .setDescription(`**Players searching: ${queueLength}${modeName === 'Duel' ? '/2' : ''}**\n**Searching for: ${timeString}**\n\nFinding players with similar MMR...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** ${modeName}\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('leave_queue')
          .setLabel('❌ Cancel Search')
          .setStyle(ButtonStyle.Danger)
      );

    return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Check if player is in an active match
  if (player.currentMatchId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Already in Match!')
      .setDescription(`You are currently in an active match: \`${player.currentMatchId}\`\n\nPlease finish your current match before searching for a new one.`)
      .setColor('#ff6b6b')
      .setTimestamp();

    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Join queue based on previously selected mode
  player.isInQueue = true;
  await player.save();
  
  let queueLength, elapsedTime, timeString, modeName, embed;
  
  if (player.selectedMode === '1v1') {
    // Join 1v1 queue
    globalQueue1v1.push({
      discordId: userId,
      mmr: player.mmr1v1,
      joinTime: Date.now()
    });

    // Start matchmaking timer if not already running
    if (globalQueue1v1.length === 1) {
      startMatchmakingTimer1v1();
    } else if (globalQueue1v1.length === 2) {
      // Immediately try to match when 2 players are found
      console.log(`2 players found in 1v1 queue, attempting immediate match creation`);
      const match = findBalancedMatch1v1(globalQueue1v1);
      if (match) {
        console.log(`Immediate match created: ${match.player1} vs ${match.player2}`);
        clearMatchmakingTimer1v1();
        await createBalancedMatch1v1(match.player1, match.player2);
        return; // Exit early since match was created
      } else {
        console.log(`No immediate match found for 2 players`);
      }
    } else if (globalQueue1v1.length === 2) {
      // Immediately try to match when 2 players are found
      const match = findBalancedMatch1v1(globalQueue1v1);
      if (match) {
        clearMatchmakingTimer1v1();
        await createBalancedMatch1v1(match.player1, match.player2);
        return; // Exit early since match was created
      }
    }

    elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
    timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    queueLength = globalQueue1v1.length;
    modeName = 'Duel';

    embed = new EmbedBuilder()
      .setTitle('🚀 Quick Start - Searching for 1v1 Duel!')
      .setDescription(`**Players searching: ${queueLength}/2**\n**Mode: 1v1 Duel**\n\nFinding a worthy opponent...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

  } else {
    // Join 5v5 queue (default)
    globalQueue5v5.push({
      discordId: userId,
      mmr: player.mmr5v5,
      joinTime: Date.now()
    });

    // Start matchmaking timer if not already running
    if (globalQueue5v5.length === 1) {
      startMatchmakingTimer5v5();
    }

    elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
    timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    queueLength = globalQueue5v5.length;
    modeName = 'Team Battle';

    embed = new EmbedBuilder()
      .setTitle('🚀 Quick Start - Searching for Match!')
      .setDescription(`**Players searching: ${queueLength}**\n**Mode: 5v5 Team Battle**\n\nFinding players with similar MMR...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('leave_queue')
        .setLabel('❌ Cancel Search')
        .setStyle(ButtonStyle.Danger)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleChooseModeButton(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎯 Choose Matchmaking Mode')
    .setDescription('Select your preferred matchmaking mode:')
    .setColor('#ffd700')
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('mode_5v5')
        .setLabel('🏆 5v5 Team Battle')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mode_1v1')
        .setLabel('⚔️ 1v1 Duel')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleCheckStatsButton(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  const winRate = player.wins + player.losses > 0 ? 
    ((player.wins / (player.wins + player.losses)) * 100).toFixed(1) : '0.0';

  const embed = new EmbedBuilder()
    .setTitle('📊 Your Valorant Stats')
    .setDescription(`**Player:** ${username}`)
    .addFields(
      {
        name: '🏆 MMR',
        value: `**${player.mmr}**`,
        inline: true
      },
      {
        name: '📈 Win/Loss',
        value: `**${player.wins}W / ${player.losses}L**`,
        inline: true
      },
      {
        name: '📊 Win Rate',
        value: `**${winRate}%**`,
        inline: true
      },
      {
        name: '🔍 Status',
        value: `**Searching:** ${player.isInQueue ? 'Yes' : 'No'}\n**Current Match:** ${player.currentMatchId ? `\`${player.currentMatchId}\`` : 'None'}`,
        inline: false
      }
    )
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleViewMatchesButton(interaction) {
  const matches = await Match.find({ status: { $in: ['active', 'finished'] } })
    .sort({ createdAt: -1 })
    .limit(10);

  if (matches.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle('🏆 Recent Matches')
      .setDescription('No matches found.')
      .setColor('#ff6b6b')
      .setTimestamp();

    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Recent Matches')
    .setDescription('Active and recent matches:')
    .setColor('#00ff00')
    .setTimestamp();

  matches.forEach(match => {
    const status = match.status === 'active' ? '🟢 Active' : '🔴 Finished';
    const winner = match.winner ? ` (Winner: Team ${match.winner})` : '';
    
    embed.addFields({
      name: `Match ${match.matchId} ${status}`,
      value: `**Teams:** ${match.teamA.length}v${match.teamB.length}${winner}\n**Created:** ${match.createdAt.toLocaleDateString()}`,
      inline: true
    });
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleShowHelpButton(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('❓ Valorant Matchmaking Bot - Help')
    .setDescription('All available commands:')
    .addFields(
      {
        name: '/vplay',
        value: 'Automatically start searching for a Valorant match with similar MMR players.',
        inline: false
      },
      {
        name: '/vmode',
        value: 'Choose between 1v1 and 5v5 matchmaking modes.',
        inline: false
      },
      {
        name: '/rank [@user]',
        value: 'View player statistics including MMR, wins, and losses.',
        inline: false
      },
      {
        name: '/matches',
        value: 'View active and recent matches.',
        inline: false
      },
      {
        name: '/votewin matchID=<id> team=<A/B>',
        value: 'Vote for match winner (All players).',
        inline: false
      },
      {
        name: '/partycode code=<code> matchID=<id>',
        value: 'Submit party code for your match (Host only).',
        inline: false
      },
      {
        name: '/vmatch',
        value: 'Show instructions and interactive buttons.',
        inline: false
      }
    )
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCancelInstructionsButton(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Instructions Closed')
    .setDescription('Use `/vmatch` to show instructions again anytime!')
    .setColor('#ff6b6b')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Vsetup command handler
async function handleVsetup(interaction) {
  // Check if user has administrator permissions
  if (!interaction.member.permissions.has('Administrator')) {
    return await interaction.reply({ 
      content: '❌ You need Administrator permissions to use this command!', 
      ephemeral: true 
    });
  }

  try {
    const guild = interaction.guild;
    const botMember = guild.members.cache.get(client.user.id);
    
    // Check if bot has necessary permissions
    if (!botMember.permissions.has(['ManageChannels', 'ManageRoles'])) {
      return await interaction.reply({ 
        content: '❌ Bot needs "Manage Channels" and "Manage Roles" permissions to set up channels!', 
        ephemeral: true 
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Create category for Valorant bot
    const category = await guild.channels.create({
      name: '🎮 Valorant Matchmaking',
      type: 4, // Category
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel'],
          deny: ['SendMessages']
        }
      ]
    });

    // Create 5v5 find-match channel (read-only for users)
    const findMatch5v5Channel = await guild.channels.create({
      name: '🏆 find-match-5v5',
      type: 0, // Text channel
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles']
        }
      ]
    });

    // Create 1v1 find-match channel (read-only for users)
    const findMatch1v1Channel = await guild.channels.create({
      name: '⚔️ find-match-1v1',
      type: 0, // Text channel
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles']
        }
      ]
    });

    // Create status channel (read-only for users)
    const statusChannel = await guild.channels.create({
      name: '📊 status',
      type: 0, // Text channel
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles']
        }
      ]
    });

    // Create party-code channel (hosts can share party codes)
    const partyCodeChannel = await guild.channels.create({
      name: '🎮 party-code',
      type: 0, // Text channel
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
          deny: ['AddReactions']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles', 'ManageMessages']
        }
      ]
    });

    // Create instructions channel (read-only for users)
    const instructionsChannel = await guild.channels.create({
      name: '📖 instructions',
      type: 0, // Text channel
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles']
        }
      ]
    });

    // Create rank channel (read-only for users)
    const rankChannel = await guild.channels.create({
      name: '🏆 rank',
      type: 0, // Text channel
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          allow: ['ViewChannel', 'ReadMessageHistory'],
          deny: ['SendMessages', 'AddReactions']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'EmbedLinks', 'AttachFiles']
        }
      ]
    });

    // Send welcome messages to each channel
    const findMatch5v5Embed = new EmbedBuilder()
      .setTitle('🏆 5v5 Find Match Channel | 5v5 Тоглолт Хайх Суваг')
      .setDescription('**English:**\nThis channel shows 5v5 matchmaking status and match announcements.\n\n**Features:**\n• Live 5v5 matchmaking updates\n• 5v5 match found notifications\n• Party code announcements\n• Team assignments\n\n**Note:** This channel is read-only for users. Use slash commands anywhere to interact with the bot.\n\n---\n\n**Монгол:**\nЭнэ суваг нь 5v5 тоглолтын статус болон мэдэгдэл харуулна.\n\n**Онцлогууд:**\n• 5v5 тоглолтын шууд шинэчлэл\n• 5v5 тоглолт олдсон мэдэгдэл\n• Party code мэдэгдэл\n• Багийн хуваарилалт\n\n**Анхаар:** Энэ суваг нь хэрэглэгчдэд зөвхөн унших эрхтэй. Bot-той харилцахын тулд slash commands ашиглана уу.')
      .setColor('#00ff00')
      .setTimestamp();

    const findMatch1v1Embed = new EmbedBuilder()
      .setTitle('⚔️ 1v1 Find Match Channel | 1v1 Тоглолт Хайх Суваг')
      .setDescription('**English:**\nThis channel shows 1v1 matchmaking status and match announcements.\n\n**Features:**\n• Live 1v1 matchmaking updates\n• 1v1 match found notifications\n• Duel announcements\n• Player assignments\n\n**Note:** This channel is read-only for users. Use slash commands anywhere to interact with the bot.\n\n---\n\n**Монгол:**\nЭнэ суваг нь 1v1 тоглолтын статус болон мэдэгдэл харуулна.\n\n**Онцлогууд:**\n• 1v1 тоглолтын шууд шинэчлэл\n• 1v1 тоглолт олдсон мэдэгдэл\n• Дуэлийн мэдэгдэл\n• Тоглогчдын хуваарилалт\n\n**Анхаар:** Энэ суваг нь хэрэглэгчдэд зөвхөн унших эрхтэй. Bot-той харилцахын тулд slash commands ашиглана уу.')
      .setColor('#ff6b6b')
      .setTimestamp();

    // Create mode selection interface for 5v5 channel
    const mode5v5Embed = new EmbedBuilder()
      .setTitle('🏆 5v5 Team Battle | 5v5 Багийн Тоглолт')
      .setDescription('**English:**\nClassic 5v5 team matches\n\n**Players needed:** 10\n**Mode:** Team vs Team\n\nClick the button below to start searching for a 5v5 match!\n\n---\n\n**Монгол:**\nСонгодог 5v5 багийн тоглолт\n\n**Хэрэгтэй тоглогч:** 10\n**Режим:** Баг vs Баг\n\n5v5 тоглолт хайж эхлэхийн тулд доорх товчийг дарна уу!')
      .setColor('#00ff00')
      .setTimestamp();

    const mode5v5Row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('mode_5v5')
          .setLabel('🏆 5v5 Team Battle | 5v5 Багийн Тоглолт')
          .setStyle(ButtonStyle.Primary)
      );

    // Create mode selection interface for 1v1 channel
    const mode1v1Embed = new EmbedBuilder()
      .setTitle('⚔️ 1v1 Duel | 1v1 Дуэль')
      .setDescription('**English:**\nIntense 1v1 duels\n\n**Players needed:** 2\n**Mode:** Player vs Player\n\nClick the button below to start searching for a 1v1 match!\n\n---\n\n**Монгол:**\nХурц 1v1 дуэль\n\n**Хэрэгтэй тоглогч:** 2\n**Режим:** Тоглогч vs Тоглогч\n\n1v1 тоглолт хайж эхлэхийн тулд доорх товчийг дарна уу!')
      .setColor('#ff6b6b')
      .setTimestamp();

    const mode1v1Row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('mode_1v1')
          .setLabel('⚔️ 1v1 Duel | 1v1 Дуэль')
          .setStyle(ButtonStyle.Secondary)
      );

    const statusEmbed = new EmbedBuilder()
      .setTitle('📊 Status Channel | Статус Суваг')
      .setDescription('**English:**\nThis channel displays bot status and system information.\n\n**Features:**\n• Bot online/offline status\n• Queue statistics\n• Match statistics\n• System health updates\n\n**Note:** This channel is read-only for users. Use slash commands anywhere to interact with the bot.\n\n---\n\n**Монгол:**\nЭнэ суваг нь bot-ийн статус болон системийн мэдээллийг харуулна.\n\n**Онцлогууд:**\n• Bot онлайн/офлайн статус\n• Очередийн статистик\n• Тоглолтын статистик\n• Системийн эрүүл мэндийн шинэчлэл\n\n**Анхаар:** Энэ суваг нь хэрэглэгчдэд зөвхөн унших эрхтэй. Bot-той харилцахын тулд slash commands ашиглана уу.')
      .setColor('#ffd700')
      .setTimestamp();

    const partyCodeEmbed = new EmbedBuilder()
      .setTitle('🎮 Party Code Channel | Party Code Суваг')
      .setDescription('**English:**\nThis channel is **ONLY** for sharing Valorant party codes during matches.\n\n**How to Use:**\n• **Hosts:** Simply type your party code (e.g., "G45YU") in this channel\n• **Bot will automatically:**\n  - Detect the party code\n  - Share it with other players\n  - Enable winner selection buttons\n\n**Examples:**\n• `G45YU`\n• `TYU23`\n• `A1B2C3`\n\n**⚠️ IMPORTANT:**\n• **Only party codes are allowed** - any other messages will be deleted\n• **Only hosts of active matches** can share party codes\n• **Use other channels** for general chat and commands\n\n---\n\n**Монгол:**\nЭнэ суваг нь **ЗӨВХӨН** Valorant party code-уудыг хуваалцах зорилготой.\n\n**Хэрхэн ашиглах:**\n• **Хост:** Party code-оо энэ сувагт бичнэ үү (жишээ: "G45YU")\n• **Bot автоматаар:**\n  - Party code-г олж харна\n  - Бусад тоглогчдод хуваалцна\n  - Ялагч сонгох товчнуудыг идэвхжүүлнэ\n\n**Жишээ:**\n• `G45YU`\n• `TYU23`\n• `A1B2C3`\n\n**⚠️ АНХААР:**\n• **Зөвхөн party code зөвшөөрөгдөнө** - бусад мессеж устгагдана\n• **Зөвхөн идэвхтэй тоглолтын хост** party code хуваалцаж болно\n• **Ерөнхий чат болон командуудын тулд бусад суваг ашиглана уу**')
      .setColor('#7289da')
      .setTimestamp();

    const partyCodeRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('clean_party_now')
          .setLabel('🧹 Clean Channel Now | Суваг Цэвэрлэх')
          .setStyle(ButtonStyle.Danger)
      );

    // Create simple, user-friendly instructions
    const instructionsEmbed = new EmbedBuilder()
      .setTitle('📖 How to Play - Valorant Matchmaking Bot | Хэрхэн Тоглох - Valorant Matchmaking Bot')
      .setDescription('**English:**\nWelcome to the Valorant Matchmaking Bot! This bot helps you find fair matches and track your progress.\n\n---\n\n**Монгол:**\nValorant Matchmaking Bot-д тавтай морил! Энэ bot нь танд шударга тоглолт олох, дэвшлийг хянах зорилготой.')
      .setColor('#ff6b6b')
      .setTimestamp();

    const gettingStartedEmbed = new EmbedBuilder()
      .setTitle('🚀 How to Start Playing | Хэрхэн Тоглох Эхлэх')
      .setDescription('**English:**\n**1. Choose Your Mode:**\n• **Team Battle (5v5):** Play with a team of 5 players\n• **Duel (1v1):** Face off against one opponent\n\n**2. Find a Match:**\n• Go to the find-match channel for your chosen mode\n• Click "Find Match" to start searching\n• Wait for the bot to find balanced opponents\n\n**3. Join the Match:**\n• When a match is found, accept it quickly\n• One player will be chosen as the host\n• Wait for the host to share the party code\n\n**4. Play and Win:**\n• Join the Valorant lobby using the party code\n• Play your match fairly\n• The host will report the winner\n• Your MMR and stats will update automatically\n\n---\n\n**Монгол:**\n**1. Режимээ сонгоно уу:**\n• **Багийн Тоглолт (5v5):** 5 тоглогчтой багт тоглох\n• **Дуэль (1v1):** Нэг өрсөлдөгчтэй тулалдах\n\n**2. Тоглолт олох:**\n• Сонгосон режимийн find-match суваг руу очих\n• "Find Match" товч дарж хайлт эхлүүлэх\n• Bot тэнцвэртэй өрсөлдөгч олохыг хүлээх\n\n**3. Тоглолтод нэгдэх:**\n• Тоглолт олдвол хурдан хүлээн авах\n• Нэг тоглогч хост болно\n• Хост party code хуваалцахыг хүлээх\n\n**4. Тоглож Ялах:**\n• Party code ашиглан Valorant lobby-д нэгдэх\n• Шударга тоглох\n• Хост ялагчийг мэдэгдэнэ\n• MMR болон статистик автоматаар шинэчлэгдэнэ')
      .setColor('#00ff00')
      .setTimestamp();

    const matchTypesEmbed = new EmbedBuilder()
      .setTitle('🎮 Match Types | Тоглолтын Төрлүүд')
      .setDescription('**English:**\n**Team Battle (5v5):**\n• 5 players vs 5 players\n• Random map selection\n• Tournament mode enabled\n• Team-based strategy and coordination\n\n**Duel (1v1):**\n• 1 player vs 1 player\n• Always played on Ascent map\n• Deathmatch mode (most kills wins)\n• Quick and intense matches\n\n**Both modes have:**\n• Fair matchmaking based on skill level\n• Separate MMR tracking\n• Automatic stat updates\n\n---\n\n**Монгол:**\n**Багийн Тоглолт (5v5):**\n• 5 тоглогч vs 5 тоглогч\n• Санамсаргүй газрын сонголт\n• Турнирын режим идэвхжсэн\n• Багийн стратеги болон зохион байгуулалт\n\n**Дуэль (1v1):**\n• 1 тоглогч vs 1 тоглогч\n• Үргэлж Ascent газраар тоглодог\n• Deathmatch режим (хамгийн олон алах ялах)\n• Хурдан, хурц тоглолт\n\n**Хоёр режимд:**\n• Чадварын түвшинд тулгуурласан шударга matchmaking\n• Тусдаа MMR хянах\n• Автомат статистик шинэчлэл')
      .setColor('#ffd700')
      .setTimestamp();

    const mmrSystemEmbed = new EmbedBuilder()
      .setTitle('📊 How MMR Works | MMR Хэрхэн Ажилладаг')
      .setDescription('**English:**\n**Starting Point:** Everyone starts with 250 MMR\n**Separate Rankings:** Your 5v5 and 1v1 skills are tracked separately\n\n**MMR Changes:**\n• **Beat stronger opponents:** Gain more MMR\n• **Beat weaker opponents:** Gain less MMR\n• **Lose to stronger opponents:** Lose less MMR\n• **Lose to weaker opponents:** Lose more MMR\n\n**Fair Matchmaking:**\nThe bot finds opponents with similar skill levels to ensure balanced and fun matches.\n\n---\n\n**Монгол:**\n**Эхлэх цэг:** Хүн бүр 250 MMR-ээр эхэлдэг\n**Тусдаа чансаа:** Таны 5v5 болон 1v1 чадварыг тусдаа хянадаг\n\n**MMR өөрчлөлт:**\n• **Илүү хүчтэй өрсөлдөгчийг ялах:** Илүү MMR авах\n• **Сул өрсөлдөгчийг ялах:** Бага MMR авах\n• **Илүү хүчтэй өрсөлдөгчдөд ялагдах:** Бага MMR алдах\n• **Суу өрсөлдөгчдөд ялагдах:** Илүү MMR алдах\n\n**Шударга Matchmaking:**\nBot тэнцвэртэй, хөгжилтэй тоглолт байхын тулд ижил түвшний өрсөлдөгч олдог.')
      .setColor('#ffd700')
      .setTimestamp();

    const tipsEmbed = new EmbedBuilder()
      .setTitle('💡 Tips for Success | Амжилтын Зөвлөмж')
      .setDescription('**English:**\n**For All Players:**\n• Be patient during matchmaking - good matches take time\n• Accept matches quickly to avoid timeouts\n• Play fairly and respect other players\n• Check your rank regularly to track progress\n\n**For Match Hosts:**\n• Create your Valorant lobby first\n• Use tournament mode for 5v5 matches\n• Choose random maps for variety\n• Share the party code in the party-code channel\n\n**General Tips:**\n• Use the rank channel to check your progress\n• Monitor the status channel for queue information\n• Ask for help if you need assistance\n\n---\n\n**Монгол:**\n**Бүх тоглогчдод:**\n• Matchmaking-д тэвчээртэй байх - сайн тоглолт цаг авдаг\n• Timeout-оос зайлсхийхийн тулд тоглолтыг хурдан хүлээн авах\n• Шударга тоглож, бусад тоглогчдод хүндлэх\n• Дэвшлийг хянахын тулд чансаагаа тогтмол шалгах\n\n**Тоглолтын хостод:**\n• Эхлээд Valorant lobby үүсгэх\n• 5v5 тоглолтод турнирын режим ашиглах\n• Төрөлжүүлэхийн тулд санамсаргүй газрыг сонгох\n• Party code-г party-code сувагт хуваалцах\n\n**Ерөнхий зөвлөмж:**\n• Дэвшлийг хянахын тулд rank суваг ашиглах\n• Очередийн мэдээллийн тулд status суваг хянах\n• Тусламж хэрэгтэй бол асуух')
      .setColor('#9c27b0')
      .setTimestamp();

    const rankEmbed = new EmbedBuilder()
      .setTitle('🏆 Rank Channel | Чансаа Суваг')
      .setDescription('**English:**\nThis channel is for checking your personal ranking and statistics.\n\n**How to Use:**\n• Click the "Check My Rank" button below\n• View your personal MMR, wins, losses, and win rate\n• See separate stats for 5v5 and 1v1 modes\n• Your rank information will be shown privately\n\n**Features:**\n• **Team Battle (5v5):** Your team matchmaking rank\n• **Duel (1v1):** Your 1v1 matchmaking rank\n• **Overall Stats:** Combined win/loss record\n• **Win Rate:** Your success percentage\n\n**Note:** This channel is read-only. Only you can see your personal rank information.\n\n---\n\n**Монгол:**\nЭнэ суваг нь хувийн чансаа болон статистик шалгах зорилготой.\n\n**Хэрхэн ашиглах:**\n• Доорх "Check My Rank" товч дарна уу\n• Хувийн MMR, ялалт, ялагдал, ялалтын хувь харах\n• 5v5 болон 1v1 режимийн тусдаа статистик харах\n• Таны чансааны мэдээлэл хувийн харагдана\n\n**Онцлогууд:**\n• **Багийн Тоглолт (5v5):** Таны багийн matchmaking чансаа\n• **Дуэль (1v1):** Таны 1v1 matchmaking чансаа\n• **Ерөнхий Статистик:** Хураангуй ялалт/ялагдал\n• **Ялалтын Хувь:** Таны амжилтын хувь\n\n**Анхаар:** Энэ суваг нь зөвхөн унших эрхтэй. Зөвхөн та өөрийн чансааны мэдээллийг харж болно.')
      .setColor('#ffd700')
      .setTimestamp();

    const rankRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('check_my_rank')
          .setLabel('🏆 Check My Rank | Миний Чансаа Шалгах')
          .setStyle(ButtonStyle.Primary)
      );

    await findMatch5v5Channel.send({ embeds: [findMatch5v5Embed] });
    await findMatch5v5Channel.send({ embeds: [mode5v5Embed], components: [mode5v5Row] });
    await findMatch1v1Channel.send({ embeds: [findMatch1v1Embed] });
    await findMatch1v1Channel.send({ embeds: [mode1v1Embed], components: [mode1v1Row] });
    await statusChannel.send({ embeds: [statusEmbed] });
    await partyCodeChannel.send({ embeds: [partyCodeEmbed], components: [partyCodeRow] });
    await rankChannel.send({ embeds: [rankEmbed], components: [rankRow] });
    
    // Clean up any existing non-party-code messages in party-code channel
    try {
      const messages = await partyCodeChannel.messages.fetch({ limit: 50 });
      const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
      
      for (const [messageId, msg] of messages) {
        if (!msg.author.bot && !partyCodePattern.test(msg.content.trim())) {
          try {
            await msg.delete();
            console.log(`Cleaned up non-party-code message: "${msg.content}" from ${msg.author.username}`);
          } catch (error) {
            console.log(`Could not delete message ${messageId}:`, error.message);
          }
        }
      }
    } catch (error) {
      console.log('Error cleaning up party-code channel:', error.message);
    }
    
    // Send simple, user-friendly instructions
    await instructionsChannel.send({ embeds: [instructionsEmbed] });
    await instructionsChannel.send({ embeds: [gettingStartedEmbed] });
    await instructionsChannel.send({ embeds: [matchTypesEmbed] });
    await instructionsChannel.send({ embeds: [mmrSystemEmbed] });
    await instructionsChannel.send({ embeds: [tipsEmbed] });

    // Send setup completion message
    const setupEmbed = new EmbedBuilder()
      .setTitle('✅ Valorant Bot Setup Complete! | Valorant Bot Тохируулах Дууссан!')
      .setDescription('**English:**\nSuccessfully created dedicated channels for the Valorant Matchmaking Bot.\n\n---\n\n**Монгол:**\nValorant Matchmaking Bot-д зориулсан тусгай суваг амжилттай үүсгэсэн.')
      .addFields(
        {
          name: '📁 Category | Ангилал',
          value: `**${category.name}**\n${category}`,
          inline: true
        },
        {
          name: '🏆 Find Match 5v5 | Тоглолт Хайх 5v5',
          value: `**${findMatch5v5Channel.name}**\n${findMatch5v5Channel}\n*Read-only for users | Хэрэглэгчдэд зөвхөн унших*`,
          inline: true
        },
        {
          name: '⚔️ Find Match 1v1 | Тоглолт Хайх 1v1',
          value: `**${findMatch1v1Channel.name}**\n${findMatch1v1Channel}\n*Read-only for users | Хэрэглэгчдэд зөвхөн унших*`,
          inline: true
        },
        {
          name: '📊 Status | Статус',
          value: `**${statusChannel.name}**\n${statusChannel}\n*Read-only for users | Хэрэглэгчдэд зөвхөн унших*`,
          inline: true
        },
        {
          name: '🎮 Party Code | Party Code',
          value: `**${partyCodeChannel.name}**\n${partyCodeChannel}\n*Share party codes | Party code хуваалцах*`,
          inline: true
        },
        {
          name: '📖 Instructions | Зааварчилгаа',
          value: `**${instructionsChannel.name}**\n${instructionsChannel}\n*Read-only guide | Зөвхөн унших заавар*`,
          inline: true
        },
        {
          name: '🏆 Rank | Чансаа',
          value: `**${rankChannel.name}**\n${rankChannel}\n*Check your rank | Чансаа шалгах*`,
          inline: true
        }
      )
      .addFields(
        {
          name: '🎯 Next Steps | Дараагийн Алхамууд',
          value: '**English:**\n1. Read the instructions channel for complete guide\n2. Use `/vmatch` to get started\n3. Players can use `/vplay` to start matchmaking\n4. Hosts share party codes in the party-code channel\n5. Monitor find-match channels for match announcements\n\n**Монгол:**\n1. Бүрэн зааварчилгааны тулд instructions суваг унших\n2. Эхлэхийн тулд `/vmatch` ашиглах\n3. Тоглогчид matchmaking эхлүүлэхийн тулд `/vplay` ашиглаж болно\n4. Хост нар party-code сувагт party code хуваалцах\n5. Тоглолтын мэдэгдэл хүлээн авахын тулд find-match суваг хянах',
          inline: false
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.editReply({ embeds: [setupEmbed] });

  } catch (error) {
    console.error('Error setting up channels:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while setting up channels. Please check bot permissions and try again.' 
    });
  }
}

// Find Match button handler
async function handleFindMatchButton(interaction) {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  // Check if player already exists
  let player = await Player.findOne({ discordId: userId });
  if (!player) {
    player = new Player({
      discordId: userId,
      username: username
    });
    await player.save();
  }

  // Check if player is already searching
  if (player.isInQueue) {
    // Determine which queue the player is in and get current status
    let queueLength, elapsedTime, timeString, modeName;
    
    if (globalQueue5v5.some(p => p.discordId === userId)) {
      // Player is in 5v5 queue
      elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
      timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
      queueLength = globalQueue5v5.length;
      modeName = 'Team Battle';
    } else if (globalQueue1v1.some(p => p.discordId === userId)) {
      // Player is in 1v1 queue
      elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
      timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
      queueLength = globalQueue1v1.length;
      modeName = 'Duel';
    } else {
      // Fallback (shouldn't happen)
      elapsedTime = 0;
      timeString = '0:00';
      queueLength = 1;
      modeName = 'Match';
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Currently Searching for ${modeName}!`)
      .setDescription(`**Players searching: ${queueLength}${modeName === 'Duel' ? '/2' : ''}**\n**Searching for: ${timeString}**\n\nFinding players with similar MMR...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** ${modeName}\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('leave_queue')
          .setLabel('❌ Cancel Search')
          .setStyle(ButtonStyle.Danger)
      );

    return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Check if player is in an active match
  if (player.currentMatchId) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Already in Match!')
      .setDescription(`You are currently in an active match: \`${player.currentMatchId}\`\n\nPlease finish your current match before searching for a new one.`)
      .setColor('#ff6b6b')
      .setTimestamp();

    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Join queue based on selected mode
  player.isInQueue = true;
  await player.save();
  
  let queueLength, elapsedTime, timeString, modeName, embed, findMatchEmbed;
  
  if (player.selectedMode === '1v1') {
    // Join 1v1 queue
    globalQueue1v1.push({
      discordId: userId,
      mmr: player.mmr1v1,
      joinTime: Date.now()
    });

    // Start matchmaking timer if not already running
    if (globalQueue1v1.length === 1) {
      startMatchmakingTimer1v1();
    } else if (globalQueue1v1.length === 2) {
      // Immediately try to match when 2 players are found
      console.log(`2 players found in 1v1 queue, attempting immediate match creation`);
      const match = findBalancedMatch1v1(globalQueue1v1);
      if (match) {
        console.log(`Immediate match created: ${match.player1} vs ${match.player2}`);
        clearMatchmakingTimer1v1();
        await createBalancedMatch1v1(match.player1, match.player2);
        return; // Exit early since match was created
      } else {
        console.log(`No immediate match found for 2 players`);
      }
    }

    elapsedTime = matchmakingStartTime1v1 ? Math.floor((Date.now() - matchmakingStartTime1v1) / 1000) : 0;
    timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    queueLength = globalQueue1v1.length;
    modeName = 'Duel';

    embed = new EmbedBuilder()
      .setTitle('⚔️ Searching for Duel!')
      .setDescription(`**Players searching: ${queueLength}/2**\n**Searching for: ${timeString}**\n\nFinding a worthy opponent...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** Duel\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    findMatchEmbed = new EmbedBuilder()
      .setTitle('⚔️ Queue Joined')
      .setDescription(`**Player:** <@${interaction.user.id}>\n**Action:** Joined matchmaking queue\n**Queue Length:** ${queueLength} players`)
      .addFields(
        {
          name: '📊 Player Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        },
        {
          name: '⏱️ Search Time',
          value: `**Started:** ${timeString}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

  } else {
    // Join 5v5 queue (default)
    globalQueue5v5.push({
      discordId: userId,
      mmr: player.mmr5v5,
      joinTime: Date.now()
    });

    // Start matchmaking timer if not already running
    if (globalQueue5v5.length === 1) {
      startMatchmakingTimer5v5();
    }

    elapsedTime = matchmakingStartTime5v5 ? Math.floor((Date.now() - matchmakingStartTime5v5) / 1000) : 0;
    timeString = elapsedTime > 0 ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}` : '0:00';
    queueLength = globalQueue5v5.length;
    modeName = 'Team Battle';

    embed = new EmbedBuilder()
      .setTitle('🔍 Searching for Match!')
      .setDescription(`**Players searching: ${queueLength}**\n**Searching for: ${timeString}**\n\nFinding players with similar MMR...`)
      .addFields(
        {
          name: '📊 Your Status',
          value: `**Searching:** ✅ Yes\n**Mode:** Team Battle\n**Current Match:** None`,
          inline: true
        },
        {
          name: '🏆 Your Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    findMatchEmbed = new EmbedBuilder()
      .setTitle('🔍 Matchmaking Update')
      .setDescription(`**Player:** <@${interaction.user.id}>\n**Action:** Started searching for match\n**Queue Length:** ${queueLength} players`)
      .addFields(
        {
          name: '📊 Player Stats',
          value: `**Team MMR:** ${player.mmr5v5}\n**Duel MMR:** ${player.mmr1v1}\n**W/L:** ${player.wins5v5 + player.wins1v1}/${player.losses5v5 + player.losses1v1}`,
          inline: true
        },
        {
          name: '⏱️ Search Time',
          value: `**Started:** ${timeString}`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('leave_queue')
        .setLabel('❌ Cancel Search')
        .setStyle(ButtonStyle.Danger)
    );

  const reply = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

  // Store the message ID for potential deletion later
  if (reply && reply.id) {
    // Store message ID in player data for later deletion
    await Player.findOneAndUpdate(
      { discordId: userId },
      { lastSearchMessageId: reply.id }
    );
  }

  // Update status channel only (no public matchmaking messages)
  await updateStatusChannel(interaction.guild);
}

// Change Mode button handler
async function handleChangeModeButton(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('🎯 Choose Matchmaking Mode')
    .setDescription('Select your preferred game mode:')
    .addFields(
      {
        name: '🏆 5v5 Team Battle',
        value: 'Classic 5v5 team matches\n**Players needed:** 10\n**Mode:** Team vs Team',
        inline: true
      },
      {
        name: '⚔️ 1v1 Duel',
        value: 'Intense 1v1 duels\n**Players needed:** 2\n**Mode:** Player vs Player',
        inline: true
      }
    )
    .setColor('#ff6b6b')
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('mode_5v5')
        .setLabel('🏆 5v5 Team Battle')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('mode_1v1')
        .setLabel('⚔️ 1v1 Duel')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Accept Match button handler (works for both 1v1 and 5v5)
async function handleAcceptMatchButton(interaction) {
  const userId = interaction.user.id;
  const matchId = interaction.customId.replace('accept_match_', '');
  
  try {
    const match = await Match.findOne({ matchId: matchId });
    if (!match) {
      return await interaction.reply({ content: 'Match not found!', ephemeral: true });
    }

    if (match.status !== 'pending') {
      return await interaction.reply({ content: 'This match is no longer pending!', ephemeral: true });
    }

    // Check if user is in this match
    const isInMatch = match.teamA.includes(userId) || match.teamB.includes(userId);
    
    if (!isInMatch) {
      return await interaction.reply({ content: 'You are not part of this match!', ephemeral: true });
    }

    // Update acceptance status based on match type
    if (match.matchType === '1v1') {
      // 1v1 logic
      const isPlayer1 = match.teamA.includes(userId);
      if (isPlayer1) {
        match.player1Accepted = true;
      } else {
        match.player2Accepted = true;
      }
    } else if (match.matchType === '5v5') {
      // 5v5 logic - track accepted players
      if (!match.acceptedPlayers) {
        match.acceptedPlayers = [];
      }
      if (!match.acceptedPlayers.includes(userId)) {
        match.acceptedPlayers.push(userId);
      }
    }

    await match.save();

    // Check if all players accepted
    let allAccepted = false;
    if (match.matchType === '1v1') {
      allAccepted = match.player1Accepted && match.player2Accepted;
    } else if (match.matchType === '5v5') {
      const totalPlayers = match.teamA.length + match.teamB.length;
      allAccepted = match.acceptedPlayers && match.acceptedPlayers.length >= totalPlayers;
    }

    if (allAccepted) {
      // All players accepted - finalize the match
      if (match.matchType === '1v1') {
        await finalize1v1Match(match);
      } else if (match.matchType === '5v5') {
        await finalize5v5Match(match);
      }
    } else {
      // Some players accepted, wait for the rest
      const acceptedCount = match.matchType === '1v1' ? 
        (match.player1Accepted ? 1 : 0) + (match.player2Accepted ? 1 : 0) :
        (match.acceptedPlayers ? match.acceptedPlayers.length : 0);
      
      const totalCount = match.matchType === '1v1' ? 2 : (match.teamA.length + match.teamB.length);
      
      const embed = new EmbedBuilder()
        .setTitle('✅ Match Accepted!')
        .setDescription(`**Match ID:** ${matchId}\n**Status:** Waiting for other players...\n\nYou have accepted the match. Waiting for ${totalCount - acceptedCount} more player(s) to accept.`)
        .setColor('#00ff00')
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (error) {
    console.error('Error handling accept match:', error);
    await interaction.reply({ content: 'An error occurred while accepting the match.', ephemeral: true });
  }
}

// Decline Match button handler
async function handleDeclineMatchButton(interaction) {
  const userId = interaction.user.id;
  const matchId = interaction.customId.replace('decline_match_', '');
  
  try {
    const match = await Match.findOne({ matchId: matchId });
    if (!match) {
      return await interaction.reply({ content: 'Match not found!', ephemeral: true });
    }

    if (match.status !== 'pending') {
      return await interaction.reply({ content: 'This match is no longer pending!', ephemeral: true });
    }

    // Check if user is in this match
    const isPlayer1 = match.teamA.includes(userId);
    const isPlayer2 = match.teamB.includes(userId);
    
    if (!isPlayer1 && !isPlayer2) {
      return await interaction.reply({ content: 'You are not part of this match!', ephemeral: true });
    }

    // Cancel the match
    match.status = 'cancelled';
    await match.save();

    // Reset players
    for (const playerId of [...match.teamA, ...match.teamB]) {
      await Player.findOneAndUpdate(
        { discordId: playerId },
        { 
          isInQueue: false,
          currentMatchId: null
        }
      );
    }

    // Notify both players
    const otherPlayerId = isPlayer1 ? match.teamB[0] : match.teamA[0];
    
    const embed = new EmbedBuilder()
      .setTitle('❌ Match Declined')
      .setDescription(`**Match ID:** ${matchId}\n**Status:** Cancelled\n\nMatch was cancelled because <@${userId}> declined.`)
      .setColor('#ff6b6b')
      .setTimestamp();

    // Notify the player who declined
    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Notify the other player
    try {
      const otherPlayer = await client.users.fetch(otherPlayerId);
      await otherPlayer.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send decline notification to ${otherPlayerId}:`, error.message);
    }

    // Update status channel
    await updateStatusChannel(interaction.guild);
  } catch (error) {
    console.error('Error handling decline match:', error);
    await interaction.reply({ content: 'An error occurred while declining the match.', ephemeral: true });
  }
}

// Finalize 1v1 match when both players accept
async function finalize1v1Match(match) {
  const player1Id = match.teamA[0];
  const player2Id = match.teamB[0];
  
  // Randomly select host
  const hostId = Math.random() < 0.5 ? player1Id : player2Id;
  
  // Update match
  match.hostId = hostId;
  match.status = 'active';
  await match.save();
  
  console.log(`Finalized 1v1 match: ${match.matchId}, hostId: ${hostId}, status: ${match.status}`);

  // Send deathmatch instructions to host
  await sendHostInstructions(hostId, match.matchId, '1v1');

  // Notify both players
  for (const playerId of [player1Id, player2Id]) {
    const embed = new EmbedBuilder()
      .setTitle('🎉 Match Accepted!')
      .setDescription(`**Match ID:** ${match.matchId}\n**Status:** Active\n**Mode:** 1v1 Deathmatch\n\n**Host:** <@${hostId}>\n**Map:** Ascent\n**Win Condition:** Most kills wins\n\n${playerId === hostId ? 'You are the host! Check your DMs for instructions.' : 'Please wait for the host to create the lobby and share the party code.'}`)
      .addFields(
        {
          name: `🥊 Player 1`,
          value: `<@${player1Id}>`,
          inline: true
        },
        {
          name: `🥊 Player 2`,
          value: `<@${player2Id}>`,
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    try {
      const player = await client.users.fetch(playerId);
      await player.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send match notification to ${playerId}:`, error.message);
    }
  }

  // Send winner selection to host immediately
  const player1 = await client.users.fetch(player1Id);
  const player2 = await client.users.fetch(player2Id);
  
  const winnerSelectionEmbed = new EmbedBuilder()
    .setTitle('🏆 Select Winner!')
    .setDescription(`**Match ID:** ${match.matchId}\n**Status:** Active\n\n**Match is ready!** Please select the winner after the match:`)
    .addFields(
      {
        name: '🥊 Players',
        value: `**Player 1:** <@${player1Id}>\n**Player 2:** <@${player2Id}>`,
        inline: false
      },
      {
        name: '📋 Instructions',
        value: '1. Create lobby in Valorant\n2. Share party code with opponent\n3. Play the match\n4. Select winner below',
        inline: false
      }
    )
    .setColor('#ffd700')
    .setTimestamp();

  const winnerRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`select_winner_${match.matchId}_${player1Id}`)
        .setLabel(`🏆 ${player1.username}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`select_winner_${match.matchId}_${player2Id}`)
        .setLabel(`🏆 ${player2.username}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

  console.log(`Created winner selection buttons for match ${match.matchId} with custom IDs: select_winner_${match.matchId}_${player1Id} and select_winner_${match.matchId}_${player2Id}`);

  try {
    const host = await client.users.fetch(hostId);
    await host.send({ embeds: [winnerSelectionEmbed], components: [winnerRow] });
  } catch (error) {
    console.log(`Could not send winner selection to host:`, error.message);
  }

  // Update status channel
  await updateStatusChannel(client.guilds.cache.first());
}

// Finalize 5v5 match when all players accept
async function finalize5v5Match(match) {
  const allPlayers = [...match.teamA, ...match.teamB];
  
  // Randomly select host from all players
  const hostId = allPlayers[Math.floor(Math.random() * allPlayers.length)];
  
  // Update match
  match.hostId = hostId;
  match.status = 'active';
  await match.save();
  
  console.log(`Finalized 5v5 match: ${match.matchId}, hostId: ${hostId}, status: ${match.status}`);

  // Send host instructions
  await sendHostInstructions(hostId, match.matchId, '5v5');

  // Notify all players
  for (const playerId of allPlayers) {
    const embed = new EmbedBuilder()
      .setTitle('🎉 Match Accepted!')
      .setDescription(`**Match ID:** ${match.matchId}\n**Status:** Active\n**Mode:** 5v5 Team Battle\n\n**Host:** <@${hostId}>\n**Map:** Random\n**Mode:** Tournament\n\n${playerId === hostId ? 'You are the host! Check your DMs for instructions.' : 'Please wait for the host to create the lobby and share the party code.'}`)
      .addFields(
        {
          name: `🔵 Team A`,
          value: match.teamA.map(id => `<@${id}>`).join('\n'),
          inline: true
        },
        {
          name: `🔴 Team B`,
          value: match.teamB.map(id => `<@${id}>`).join('\n'),
          inline: true
        }
      )
      .setColor('#00ff00')
      .setTimestamp();

    try {
      const player = await client.users.fetch(playerId);
      await player.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send match notification to ${playerId}:`, error.message);
    }
  }

  // Send winner selection to host immediately (disabled until party code)
  const winnerSelectionEmbed = new EmbedBuilder()
    .setTitle('🏆 Select Winner!')
    .setDescription(`**Match ID:** ${match.matchId}\n\n**Match completed!** Please select the winning team:\n\n**Note:** These buttons will be enabled after you share the party code.`)
    .addFields(
      {
        name: '🔵 Team A',
        value: match.teamA.map(id => `<@${id}>`).join('\n'),
        inline: true
      },
      {
        name: '🔴 Team B',
        value: match.teamB.map(id => `<@${id}>`).join('\n'),
        inline: true
      }
    )
    .setColor('#ffd700')
    .setTimestamp();

  const winnerRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`select_winner_${match.matchId}_A`)
        .setLabel('🔵 Team A Wins')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`select_winner_${match.matchId}_B`)
        .setLabel('🔴 Team B Wins')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

  try {
    const host = await client.users.fetch(hostId);
    await host.send({ embeds: [winnerSelectionEmbed], components: [winnerRow] });
  } catch (error) {
    console.log(`Could not send winner selection to host:`, error.message);
  }

  // Update status channel
  const guild = client.guilds.cache.first();
  if (guild) {
    await updateStatusChannel(guild);
  }

  console.log(`Finalized 5v5 match: ${match.matchId}, hostId: ${hostId}, status: ${match.status}`);
}

// Select winner button handler (works for both 1v1 and 5v5)
async function handleSelectWinnerButton(interaction) {
  const customId = interaction.customId;
  
  // Parse customId: "select_winner_MATCHID_WINNER" where WINNER can be playerId (1v1) or team (A/B for 5v5)
  const prefix = 'select_winner_';
  if (!customId.startsWith(prefix)) {
    return await interaction.reply({ content: 'Invalid button!', ephemeral: true });
  }
  
  const withoutPrefix = customId.substring(prefix.length);
  const lastUnderscoreIndex = withoutPrefix.lastIndexOf('_');
  
  if (lastUnderscoreIndex === -1) {
    return await interaction.reply({ content: 'Invalid button format!', ephemeral: true });
  }
  
  const matchId = withoutPrefix.substring(0, lastUnderscoreIndex);
  const winner = withoutPrefix.substring(lastUnderscoreIndex + 1);
  
  console.log(`Winner selection button clicked: customId=${customId}, matchId=${matchId}, winner=${winner}`);
  
  try {
    const match = await Match.findOne({ matchId: matchId });
    
    if (!match) {
      return await interaction.reply({ content: `Match not found! Looking for: ${matchId}`, ephemeral: true });
    }

    if (match.hostId !== interaction.user.id) {
      return await interaction.reply({ content: 'Only the host can select the winner!', ephemeral: true });
    }

    if (match.status !== 'active') {
      return await interaction.reply({ content: 'This match is not active!', ephemeral: true });
    }

    if (!match.partyCode) {
      return await interaction.reply({ content: 'Please share the party code first before selecting a winner!', ephemeral: true });
    }

    // Handle different match types
    if (match.matchType === '1v1') {
      await handle1v1WinnerSelection(match, winner, interaction);
    } else if (match.matchType === '5v5') {
      await handle5v5WinnerSelection(match, winner, interaction);
    } else {
      return await interaction.reply({ content: 'Unknown match type!', ephemeral: true });
    }

  } catch (error) {
    console.error('Error handling winner selection:', error);
    await interaction.reply({ content: 'An error occurred while processing the winner selection.', ephemeral: true });
  }
}

// Handle 1v1 winner selection
async function handle1v1WinnerSelection(match, winnerId, interaction) {
  const allPlayers = [...match.teamA, ...match.teamB];
  
  if (!allPlayers.includes(winnerId)) {
    return await interaction.reply({ content: 'The winner must be one of the players in this match!', ephemeral: true });
  }

  // Update match with winner
  match.winner = allPlayers.indexOf(winnerId) < match.teamA.length ? 'A' : 'B';
  match.status = 'finished';
  match.finishedAt = new Date();
  await match.save();

  // Get winner and loser
  const winner = await Player.findOne({ discordId: winnerId });
  const loserId = allPlayers.find(id => id !== winnerId);
  const loser = await Player.findOne({ discordId: loserId });

  if (!winner || !loser) {
    return await interaction.reply({ content: 'Could not find players in database!', ephemeral: true });
  }

  // Calculate MMR changes for 1v1
  const winnerMMR = winner.mmr1v1;
  const loserMMR = loser.mmr1v1;
  
  // Calculate MMR change for winner (they won)
  const winnerMMRChange = calculateMMRChange1v1(winnerMMR, loserMMR, true);
  // Calculate MMR change for loser (they lost)
  const loserMMRChange = calculateMMRChange1v1(loserMMR, winnerMMR, false);

  console.log(`1v1 MMR Changes - Winner: ${winner.username} (${winnerMMR}) +${winnerMMRChange}, Loser: ${loser.username} (${loserMMR}) -${loserMMRChange}`);

  // Update winner (add MMR)
  winner.mmr1v1 += winnerMMRChange;
  winner.wins1v1 += 1;
  winner.updateRank1v1();
  winner.isInQueue = false;
  winner.currentMatchId = null;
  await winner.save();

  // Update loser (subtract MMR)
  loser.mmr1v1 -= loserMMRChange;
  loser.losses1v1 += 1;
  loser.updateRank1v1();
  loser.isInQueue = false;
  loser.currentMatchId = null;
  await loser.save();

  // Send results to both players
  for (const playerId of allPlayers) {
    const isWinner = playerId === winnerId;
    const player = isWinner ? winner : loser;
    const mmrChange = isWinner ? winnerMMRChange : loserMMRChange;
    
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Match Results - ${isWinner ? 'Victory!' : 'Defeat'}`)
      .setDescription(`**Match ID:** ${match.matchId}\n**Status:** Completed\n\n**Winner:** <@${winnerId}>\n**MMR Change:** ${isWinner ? `+${mmrChange}` : `-${mmrChange}`}\n**New MMR:** ${player.mmr1v1}`)
      .setColor(isWinner ? '#00ff00' : '#ff6b6b')
      .setTimestamp();

    try {
      const playerUser = await client.users.fetch(playerId);
      await playerUser.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send results to ${playerId}:`, error.message);
    }
  }

  // Update status channel
  await updateStatusChannel(client.guilds.cache.first());

  // Send confirmation to host
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Winner Selected!')
    .setDescription(`**Match ID:** ${match.matchId}\n**Winner:** <@${winnerId}>\n\nMatch results have been processed and MMR has been updated!`)
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
}

// Handle 5v5 winner selection
async function handle5v5WinnerSelection(match, winningTeam, interaction) {
  if (winningTeam !== 'A' && winningTeam !== 'B') {
    return await interaction.reply({ content: 'Invalid team selection! Must be A or B.', ephemeral: true });
  }

  // Update match with winner
  match.winner = winningTeam;
  match.status = 'finished';
  match.finishedAt = new Date();
  await match.save();

  // Get all players
  const winningTeamPlayers = winningTeam === 'A' ? match.teamA : match.teamB;
  const losingTeamPlayers = winningTeam === 'A' ? match.teamB : match.teamA;
  const allPlayers = [...match.teamA, ...match.teamB];

  // Calculate team average MMRs
  const winningTeamMMR = await calculateTeamAverageMMR5v5(winningTeamPlayers);
  const losingTeamMMR = await calculateTeamAverageMMR5v5(losingTeamPlayers);

  // Update MMR for all players
  for (const playerId of allPlayers) {
    const player = await Player.findOne({ discordId: playerId });
    if (!player) continue;

    const isWinner = winningTeamPlayers.includes(playerId);
    const opponentMMR = isWinner ? losingTeamMMR : winningTeamMMR;
    
    // Calculate MMR change
    const mmrChange = calculateMMRChange5v5(player.mmr5v5, opponentMMR, isWinner);
    
    console.log(`5v5 MMR Change - ${player.username}: ${isWinner ? 'Winner' : 'Loser'} (${player.mmr5v5}) ${isWinner ? '+' : '-'}${mmrChange}`);

    // Update player stats
    if (isWinner) {
      player.mmr5v5 += mmrChange;
      player.wins5v5 += 1;
    } else {
      player.mmr5v5 -= mmrChange;
      player.losses5v5 += 1;
    }
    
    player.updateRank5v5();
    player.isInQueue = false;
    player.currentMatchId = null;
    await player.save();
  }

  // Send results to all players
  for (const playerId of allPlayers) {
    const player = await Player.findOne({ discordId: playerId });
    if (!player) continue;

    const isWinner = winningTeamPlayers.includes(playerId);
    const opponentMMR = isWinner ? losingTeamMMR : winningTeamMMR;
    const mmrChange = calculateMMRChange5v5(player.mmr5v5, opponentMMR, isWinner);
    
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Match Results - ${isWinner ? 'Victory!' : 'Defeat'}`)
      .setDescription(`**Match ID:** ${match.matchId}\n**Status:** Completed\n\n**Winning Team:** Team ${winningTeam}\n**MMR Change:** ${isWinner ? `+${mmrChange}` : `-${mmrChange}`}\n**New MMR:** ${player.mmr5v5}`)
      .addFields(
        {
          name: `🔵 Team A ${winningTeam === 'A' ? '(Winners)' : '(Losers)'}`,
          value: match.teamA.map(id => `<@${id}>`).join('\n'),
          inline: true
        },
        {
          name: `🔴 Team B ${winningTeam === 'B' ? '(Winners)' : '(Losers)'}`,
          value: match.teamB.map(id => `<@${id}>`).join('\n'),
          inline: true
        }
      )
      .setColor(isWinner ? '#00ff00' : '#ff6b6b')
      .setTimestamp();

    try {
      const playerUser = await client.users.fetch(playerId);
      await playerUser.send({ embeds: [embed] });
    } catch (error) {
      console.log(`Could not send results to ${playerId}:`, error.message);
    }
  }

  // Update status channel
  await updateStatusChannel(client.guilds.cache.first());

  // Send confirmation to host
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Winner Selected!')
    .setDescription(`**Match ID:** ${match.matchId}\n**Winning Team:** Team ${winningTeam}\n\nMatch results have been processed and MMR has been updated for all players!`)
    .setColor('#00ff00')
    .setTimestamp();

  await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
}

// Clean party channel handler
async function handleCleanParty(interaction) {
  // Check if user has administrator permissions
  if (!interaction.member.permissions.has('Administrator')) {
    return await interaction.reply({ 
      content: '❌ You need Administrator permissions to use this command!', 
      ephemeral: true 
    });
  }

  try {
    // Find the party-code channel
    const partyCodeChannel = interaction.guild.channels.cache.find(
      channel => channel.name === 'party-code' || 
                 channel.name === '🎮 party-code' ||
                 channel.name === '-party-code'
    );

    if (!partyCodeChannel) {
      return await interaction.reply({ 
        content: '❌ Party-code channel not found! Use `/vsetup` to create it first.', 
        ephemeral: true 
      });
    }

    // Check if bot has permission to manage messages
    if (!partyCodeChannel.permissionsFor(interaction.guild.members.me).has('ManageMessages')) {
      return await interaction.reply({ 
        content: '❌ Bot does not have permission to delete messages in the party-code channel!', 
        ephemeral: true 
      });
    }

    await interaction.reply({ 
      content: '🧹 Cleaning up party-code channel...', 
      ephemeral: true 
    });

    // Fetch messages and clean up
    const messages = await partyCodeChannel.messages.fetch({ limit: 100 });
    const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
    let deletedCount = 0;
    
    for (const [messageId, msg] of messages) {
      if (!msg.author.bot && !partyCodePattern.test(msg.content.trim())) {
        try {
          await msg.delete();
          deletedCount++;
          console.log(`Cleaned up non-party-code message: "${msg.content}" from ${msg.author.username}`);
        } catch (error) {
          console.log(`Could not delete message ${messageId}:`, error.message);
        }
      }
    }

    await interaction.followUp({ 
      content: `✅ Cleanup complete! Deleted ${deletedCount} non-party-code messages from the party-code channel.`, 
      ephemeral: true 
    });

  } catch (error) {
    console.error('Error cleaning party channel:', error);
    await interaction.followUp({ 
      content: '❌ An error occurred while cleaning the party-code channel.', 
      ephemeral: true 
    });
  }
}

// Clean party now button handler
async function handleCleanPartyNowButton(interaction) {
  // Check if user has administrator permissions
  if (!interaction.member.permissions.has('Administrator')) {
    return await interaction.reply({ 
      content: '❌ You need Administrator permissions to use this button!', 
      ephemeral: true 
    });
  }

  try {
    await interaction.reply({ 
      content: '🧹 Cleaning up party-code channel...', 
      ephemeral: true 
    });

    // Fetch messages and clean up
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
    let deletedCount = 0;
    
    for (const [messageId, msg] of messages) {
      if (!msg.author.bot && !partyCodePattern.test(msg.content.trim())) {
        try {
          await msg.delete();
          deletedCount++;
          console.log(`🧹 Button cleanup: Deleted "${msg.content}" from ${msg.author.username}`);
        } catch (error) {
          console.log(`Could not delete message ${messageId}:`, error.message);
        }
      }
    }

    await interaction.followUp({ 
      content: `✅ Cleanup complete! Deleted ${deletedCount} non-party-code messages from this channel.`, 
      ephemeral: true 
    });

  } catch (error) {
    console.error('Error cleaning party channel via button:', error);
    await interaction.followUp({ 
      content: '❌ An error occurred while cleaning the channel.', 
      ephemeral: true 
    });
  }
}

// Check my rank button handler
async function handleCheckMyRankButton(interaction) {
  const userId = interaction.user.id;
  
  try {
    // Find or create player
    let player = await Player.findOne({ discordId: userId });
    if (!player) {
      player = new Player({
        discordId: userId,
        username: interaction.user.username,
        mmr5v5: 250,
        mmr1v1: 250,
        wins5v5: 0,
        losses5v5: 0,
        wins1v1: 0,
        losses1v1: 0,
        rank5v5: '250',
        rank1v1: '250'
      });
      await player.save();
    }

    // Calculate win rates
    const totalWins5v5 = player.wins5v5;
    const totalLosses5v5 = player.losses5v5;
    const totalWins1v1 = player.wins1v1;
    const totalLosses1v1 = player.losses1v1;
    const totalWins = totalWins5v5 + totalWins1v1;
    const totalLosses = totalLosses5v5 + totalLosses1v1;
    
    const winRate5v5 = totalWins5v5 + totalLosses5v5 > 0 ? 
      Math.round((totalWins5v5 / (totalWins5v5 + totalLosses5v5)) * 100) : 0;
    const winRate1v1 = totalWins1v1 + totalLosses1v1 > 0 ? 
      Math.round((totalWins1v1 / (totalWins1v1 + totalLosses1v1)) * 100) : 0;
    const overallWinRate = totalWins + totalLosses > 0 ? 
      Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${interaction.user.username}'s Rank`)
      .setDescription('Your personal ranking and statistics')
      .setColor('#ffd700')
      .setTimestamp()
      .addFields(
        {
          name: '⚔️ Team Battle (5v5)',
          value: `**MMR:** ${player.mmr5v5}\n**Wins:** ${totalWins5v5}\n**Losses:** ${totalLosses5v5}\n**Win Rate:** ${winRate5v5}%`,
          inline: true
        },
        {
          name: '🥊 Duel (1v1)',
          value: `**MMR:** ${player.mmr1v1}\n**Wins:** ${totalWins1v1}\n**Losses:** ${totalLosses1v1}\n**Win Rate:** ${winRate1v1}%`,
          inline: true
        },
        {
          name: '📊 Overall Stats',
          value: `**Total Wins:** ${totalWins}\n**Total Losses:** ${totalLosses}\n**Overall Win Rate:** ${overallWinRate}%`,
          inline: false
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } catch (error) {
    console.error('Error handling check my rank button:', error);
    await interaction.reply({ content: 'An error occurred while fetching your rank.', ephemeral: true });
  }
}

// Screenshot button handler
async function handleScreenshotButton(interaction) {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const matchId = parts[2];
  const playerId = parts[3];
  
  if (interaction.user.id !== playerId) {
    return await interaction.reply({ content: 'This button is not for you!', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('📸 Send Screenshot')
    .setDescription(`**Match ID:** ${matchId}\n\nPlease upload an image/screenshot of your match results.\n\n**Instructions:**\n1. Take a screenshot of your match results\n2. Upload it as an attachment in this DM\n3. The image will be shared with your opponent\n\n**Note:** Only image files are accepted.`)
    .setColor('#ffd700')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Test function to verify pattern matching
function testPartyCodePattern() {
  const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
  const testCodes = ['G45YU', 'TYU23', 'A1B2C3', 'YIO52', 'ABC123'];
  
  console.log('Testing party code patterns:');
  testCodes.forEach(code => {
    console.log(`${code}: ${partyCodePattern.test(code)}`);
  });
}

// Run test on startup
testPartyCodePattern();

// Periodic cleanup of party-code channels (every 30 seconds)
setInterval(async () => {
  try {
    const guilds = client.guilds.cache;
    
    for (const [guildId, guild] of guilds) {
      // Find party-code channels
      const partyCodeChannels = guild.channels.cache.filter(channel => {
        const channelName = channel.name.toLowerCase();
        return channel.type === 0 && channelName.includes('party') && channelName.includes('code');
      });
      
      for (const [channelId, channel] of partyCodeChannels) {
        try {
          // Check if bot has permission to manage messages
          if (!channel.permissionsFor(guild.members.me).has('ManageMessages')) {
            continue;
          }
          
          // Fetch recent messages
          const messages = await channel.messages.fetch({ limit: 20 });
          const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
          
          for (const [messageId, msg] of messages) {
            if (!msg.author.bot && !partyCodePattern.test(msg.content.trim())) {
              try {
                await msg.delete();
                console.log(`🧹 Periodic cleanup: Deleted "${msg.content}" from ${msg.author.username} in ${channel.name}`);
              } catch (error) {
                console.log(`Could not delete message ${messageId} during periodic cleanup:`, error.message);
              }
            }
          }
        } catch (error) {
          console.log(`Error during periodic cleanup of ${channel.name}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.log('Error during periodic party-code cleanup:', error.message);
  }
}, 30000); // Run every 30 seconds

// Handle party code detection in all channels (including DMs)
client.on('messageCreate', async message => {
  // Skip bot messages
  if (message.author.bot) return;
  
  // Check if message is in party-code channel (more flexible matching)
  const channelName = message.channel.name.toLowerCase();
  const isPartyCodeChannel = channelName.includes('party') && channelName.includes('code');
  
  console.log(`Message in channel: "${message.channel.name}" - Is party code channel: ${isPartyCodeChannel}`);
  
  if (isPartyCodeChannel) {
    // In party-code channel, only allow party codes
    const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
    const trimmedContent = message.content.trim();
    
    console.log(`Testing message: "${trimmedContent}" - Pattern match: ${partyCodePattern.test(trimmedContent)}`);
    
    if (!partyCodePattern.test(trimmedContent)) {
      // Not a party code, delete the message
      try {
        await message.delete();
        console.log(`✅ Deleted non-party-code message: "${message.content}" from ${message.author.username}`);
        
        // Send a warning message that gets deleted after 3 seconds
        const warningMessage = await message.channel.send({
          content: `⚠️ Only party codes are allowed in this channel! Your message has been deleted.`,
          allowedMentions: { users: [message.author.id] }
        });
        
        // Delete the warning after 3 seconds
        setTimeout(async () => {
          try {
            await warningMessage.delete();
          } catch (error) {
            console.log('Could not delete warning message:', error.message);
          }
        }, 3000);
        
      } catch (error) {
        console.log('❌ Could not delete message:', error.message);
        console.log('Bot permissions:', message.channel.permissionsFor(message.guild.members.me).has('ManageMessages'));
      }
      return;
    }
  }
  
  // Simple test - log all messages to see if bot is receiving them
  console.log(`Bot received message: "${message.content}" from ${message.author.username} in ${message.channel.type === 1 ? 'DM' : 'channel'}`);
  console.log(`Message channel ID: ${message.channel.id}, Guild ID: ${message.guild?.id || 'DM'}`);
  
  try {
    // Check if user is a host of an active match
    const player = await Player.findOne({ discordId: message.author.id });
    console.log(`Player lookup for ${message.author.username}:`, player ? `Found, currentMatchId: ${player.currentMatchId}` : 'Not found');
    
    if (!player || !player.currentMatchId) return;

    const match = await Match.findOne({ matchId: player.currentMatchId });
    console.log(`Match lookup for ${player.currentMatchId}:`, match ? `Found, status: ${match.status}, hostId: ${match.hostId}` : 'Not found');
    
    if (!match) {
      console.log(`Match not found for ${player.currentMatchId}`);
      return;
    }
    
    if (match.status !== 'active') {
      console.log(`Match status is not active: ${match.status}`);
      return;
    }
    
    if (match.hostId !== message.author.id) {
      console.log(`User ${message.author.username} is not the host. Host is: ${match.hostId}`);
      return;
    }

    console.log(`Party code detection: User ${message.author.username} sent "${message.content}" in ${message.channel.type === 1 ? 'DM' : 'channel'}`);

    // Check if message looks like a party code (4-6 alphanumeric characters)
    const partyCodePattern = /^[A-Z0-9]{4,6}$/i;
    const trimmedContent = message.content.trim();
    
    console.log(`Testing pattern for: "${trimmedContent}" - Pattern match: ${partyCodePattern.test(trimmedContent)}`);
    
    // Test specific codes from the image
    if (trimmedContent === 'G45YU' || trimmedContent === 'TYU23' || trimmedContent === 'A1B2C3') {
      console.log(`SPECIAL TEST: ${trimmedContent} should match pattern: ${partyCodePattern.test(trimmedContent)}`);
    }
    
        if (partyCodePattern.test(trimmedContent)) {
          const partyCode = message.content.trim().toUpperCase();
          console.log(`Party code detected: ${partyCode} for match ${match.matchId}`);
          
          // Update match with party code
          match.partyCode = partyCode;
          await match.save();

          // Get all players in the match
          const allPlayers = [...match.teamA, ...match.teamB];
          console.log(`Sending party code to players: ${allPlayers.join(', ')}`);
          
          // Send party code to all players except the host
          for (const playerId of allPlayers) {
            if (playerId !== message.author.id) {
              console.log(`Sending party code to player: ${playerId}`);
              const embed = new EmbedBuilder()
                .setTitle('🎮 Party Code Received!')
                .setDescription(`**Match ID:** ${match.matchId}\n**Host:** <@${message.author.id}>\n\n**Party Code:** \`${partyCode}\`\n\nJoin the match using this code in Valorant!`)
                .addFields(
                  {
                    name: '📋 Match Details',
                    value: `**Mode:** ${match.matchType === '1v1' ? '1v1 Deathmatch' : '5v5 Team Battle'}\n**Map:** ${match.matchType === '1v1' ? 'Ascent' : 'Random'}\n**Status:** Active`,
                    inline: true
                  }
                )
                .setColor('#00ff00')
                .setTimestamp();

              try {
                const player = await client.users.fetch(playerId);
                await player.send({ embeds: [embed] });
              } catch (error) {
                console.log(`Could not send party code to ${playerId}:`, error.message);
              }
            }
          }

          // Enable winner selection buttons based on match type
          if (match.matchType === '1v1') {
            const player1Id = match.teamA[0];
            const player2Id = match.teamB[0];
            
            // Get player names
            const player1 = await client.users.fetch(player1Id);
            const player2 = await client.users.fetch(player2Id);
            
            const winnerSelectionEmbed = new EmbedBuilder()
              .setTitle('🏆 Select Winner!')
              .setDescription(`**Match ID:** ${match.matchId}\n**Party Code:** \`${partyCode}\`\n\n**Match completed!** Please select the winner:`)
              .addFields(
                {
                  name: '🥊 Players',
                  value: `**Player 1:** <@${player1Id}>\n**Player 2:** <@${player2Id}>`,
                  inline: false
                }
              )
              .setColor('#ffd700')
              .setTimestamp();

            const winnerRow = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`select_winner_${match.matchId}_${player1Id}`)
                  .setLabel(`🏆 ${player1.username}`)
                  .setStyle(ButtonStyle.Success)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId(`select_winner_${match.matchId}_${player2Id}`)
                  .setLabel(`🏆 ${player2.username}`)
                  .setStyle(ButtonStyle.Success)
                  .setDisabled(false)
              );

            try {
              const host = await client.users.fetch(message.author.id);
              await host.send({ embeds: [winnerSelectionEmbed], components: [winnerRow] });
            } catch (error) {
              console.log(`Could not send winner selection to host:`, error.message);
            }
          } else if (match.matchType === '5v5') {
            const winnerSelectionEmbed = new EmbedBuilder()
              .setTitle('🏆 Select Winner!')
              .setDescription(`**Match ID:** ${match.matchId}\n**Party Code:** \`${partyCode}\`\n\n**Match completed!** Please select the winning team:`)
              .addFields(
                {
                  name: '🔵 Team A',
                  value: match.teamA.map(id => `<@${id}>`).join('\n'),
                  inline: true
                },
                {
                  name: '🔴 Team B',
                  value: match.teamB.map(id => `<@${id}>`).join('\n'),
                  inline: true
                }
              )
              .setColor('#ffd700')
              .setTimestamp();

            const winnerRow = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`select_winner_${match.matchId}_A`)
                  .setLabel('🔵 Team A Wins')
                  .setStyle(ButtonStyle.Success)
                  .setDisabled(false),
                new ButtonBuilder()
                  .setCustomId(`select_winner_${match.matchId}_B`)
                  .setLabel('🔴 Team B Wins')
                  .setStyle(ButtonStyle.Danger)
                  .setDisabled(false)
              );

            try {
              const host = await client.users.fetch(message.author.id);
              await host.send({ embeds: [winnerSelectionEmbed], components: [winnerRow] });
            } catch (error) {
              console.log(`Could not send winner selection to host:`, error.message);
            }
          }

          // Delete the host's original message to keep party code private
          try {
            await message.delete();
          } catch (error) {
            console.log('Could not delete host message:', error.message);
          }

          // Send private confirmation to host
          const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Party Code Shared!')
            .setDescription(`**Match ID:** ${match.matchId}\n**Party Code:** \`${partyCode}\`\n\nParty code has been sent to all players in the match.`)
            .setColor('#00ff00')
            .setTimestamp();

          try {
            const host = await client.users.fetch(message.author.id);
            await host.send({ embeds: [confirmEmbed] });
          } catch (error) {
            console.log(`Could not send private confirmation to host:`, error.message);
          }
        }
  } catch (error) {
    console.error('Error handling party code detection:', error);
  }
});

// Handle image uploads in DMs
client.on('messageCreate', async message => {
  // Only handle DMs and messages with attachments
  if (message.channel.type !== 1 || !message.attachments.size) return;
  
  try {
    // Check if user is in an active 1v1 match
    const player = await Player.findOne({ discordId: message.author.id });
    if (!player || !player.currentMatchId) return;

    const match = await Match.findOne({ matchId: player.currentMatchId });
    if (!match || match.matchType !== '1v1' || !match.hostReportedWinner) return;

    // Get the opponent
    const allPlayers = [...match.teamA, ...match.teamB];
    const opponentId = allPlayers.find(id => id !== message.author.id);
    
    if (!opponentId) return;

    // Process the image
    const attachment = message.attachments.first();
    if (!attachment.contentType.startsWith('image/')) {
      return await message.reply('Please send an image file only!');
    }

    // Update match with screenshot
    if (message.author.id === match.hostReportedWinner) {
      match.winnerScreenshot = attachment.url;
    } else {
      match.loserScreenshot = attachment.url;
    }
    await match.save();

    // Send confirmation to sender
    const confirmEmbed = new EmbedBuilder()
      .setTitle('✅ Screenshot Received!')
      .setDescription(`**Match ID:** ${match.matchId}\n\nYour screenshot has been received and will be shared with your opponent.`)
      .setColor('#00ff00')
      .setTimestamp();

    await message.reply({ embeds: [confirmEmbed] });

    // Send screenshot to opponent
    const opponentEmbed = new EmbedBuilder()
      .setTitle('📸 Opponent Screenshot')
      .setDescription(`**Match ID:** ${match.matchId}\n\nYour opponent has sent their match results screenshot.`)
      .setImage(attachment.url)
      .setColor('#ffd700')
      .setTimestamp();

    try {
      const opponent = await client.users.fetch(opponentId);
      await opponent.send({ embeds: [opponentEmbed] });
    } catch (error) {
      console.log(`Could not send screenshot to opponent ${opponentId}:`, error.message);
    }

    // If both screenshots received, finalize match
    if (match.winnerScreenshot && match.loserScreenshot) {
      await finalize1v1MatchResults(match);
    }

  } catch (error) {
    console.error('Error handling image upload:', error);
  }
});

// Finalize 1v1 match results
async function finalize1v1MatchResults(match) {
  const winnerId = match.hostReportedWinner;
  const allPlayers = [...match.teamA, ...match.teamB];
  const loserId = allPlayers.find(id => id !== winnerId);

  // Update MMR
  const winner = await Player.findOne({ discordId: winnerId });
  const loser = await Player.findOne({ discordId: loserId });

  if (winner && loser) {
    const mmrChange = calculateMMRChange1v1(winner.mmr1v1, loser.mmr1v1, true);
    
    winner.mmr1v1 += mmrChange;
    winner.wins1v1 += 1;
    winner.updateRank1v1();
    await winner.save();

    loser.mmr1v1 -= mmrChange;
    loser.losses1v1 += 1;
    loser.updateRank1v1();
    await loser.save();

    // Reset players
    for (const playerId of allPlayers) {
      await Player.findOneAndUpdate(
        { discordId: playerId },
        { 
          isInQueue: false,
          currentMatchId: null
        }
      );
    }

    // Update match status
    match.status = 'finished';
    match.finishedAt = new Date();
    await match.save();

    // Notify both players of final results
    for (const playerId of allPlayers) {
      const isWinner = playerId === winnerId;
      const embed = new EmbedBuilder()
        .setTitle(`🏆 Match Finalized - ${isWinner ? 'Victory!' : 'Defeat'}`)
        .setDescription(`**Match ID:** ${match.matchId}\n**Status:** Completed\n\n**Winner:** <@${winnerId}>\n**MMR Change:** ${isWinner ? `+${mmrChange}` : `-${mmrChange}`}\n**New MMR:** ${isWinner ? winner.mmr1v1 : loser.mmr1v1}`)
        .setColor(isWinner ? '#00ff00' : '#ff6b6b')
        .setTimestamp();

      try {
        const player = await client.users.fetch(playerId);
        await player.send({ embeds: [embed] });
      } catch (error) {
        console.log(`Could not send final results to ${playerId}:`, error.message);
      }
    }

    // Update status channel
    await updateStatusChannel(client.guilds.cache.first());
  }
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
