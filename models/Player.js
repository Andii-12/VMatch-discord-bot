const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  // 5v5 stats
  mmr5v5: {
    type: Number,
    default: 250
  },
  wins5v5: {
    type: Number,
    default: 0
  },
  losses5v5: {
    type: Number,
    default: 0
  },
  rank5v5: {
    type: String,
    default: '250'
  },
  // 1v1 stats
  mmr1v1: {
    type: Number,
    default: 250
  },
  wins1v1: {
    type: Number,
    default: 0
  },
  losses1v1: {
    type: Number,
    default: 0
  },
  rank1v1: {
    type: String,
    default: '250'
  },
  // Legacy fields for backward compatibility
  mmr: {
    type: Number,
    default: 250
  },
  wins: {
    type: Number,
    default: 0
  },
  losses: {
    type: Number,
    default: 0
  },
  rank: {
    type: String,
    default: '250'
  },
  isInQueue: {
    type: Boolean,
    default: false
  },
  currentMatchId: {
    type: String,
    default: null
  },
  selectedMode: {
    type: String,
    default: '5v5',
    enum: ['5v5', '1v1']
  },
  lastSearchMessageId: {
    type: String,
    default: null
  }
});

// Update rank to just show MMR number
playerSchema.methods.updateRank = function() {
  this.rank = this.mmr.toString();
};

// Update 5v5 rank
playerSchema.methods.updateRank5v5 = function() {
  this.rank5v5 = this.mmr5v5.toString();
};

// Update 1v1 rank
playerSchema.methods.updateRank1v1 = function() {
  this.rank1v1 = this.mmr1v1.toString();
};

module.exports = mongoose.model('Player', playerSchema);
