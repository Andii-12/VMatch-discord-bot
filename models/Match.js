const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true
  },
  hostId: {
    type: String,
    required: false,
    default: null
  },
  teamA: [{
    type: String,
    ref: 'Player'
  }],
  teamB: [{
    type: String,
    ref: 'Player'
  }],
  status: {
    type: String,
    enum: ['waiting', 'pending', 'active', 'finished', 'cancelled'],
    default: 'waiting'
  },
  winner: {
    type: String,
    enum: ['A', 'B', null],
    default: null
  },
  votes: [{
    playerId: String,
    team: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  finishedAt: {
    type: Date,
    default: null
  },
  partyCode: {
    type: String,
    default: null
  },
  hostInstructions: {
    type: String,
    default: null
  },
  // 1v1 accept/decline system
  player1Accepted: {
    type: Boolean,
    default: false
  },
  player2Accepted: {
    type: Boolean,
    default: false
  },
  acceptDeadline: {
    type: Date,
    default: null
  },
  matchType: {
    type: String,
    default: '5v5',
    enum: ['5v5', '1v1']
  },
  // 5v5 accept/decline system
  acceptedPlayers: [{
    type: String,
    ref: 'Player'
  }],
  // Win reporting for 1v1
  hostReportedWinner: {
    type: String,
    default: null
  },
  winnerScreenshot: {
    type: String,
    default: null
  },
  loserScreenshot: {
    type: String,
    default: null
  }
});

module.exports = mongoose.model('Match', matchSchema);
