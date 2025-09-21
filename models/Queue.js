const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  players: [{
    type: String,
    ref: 'Player'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Queue', queueSchema);
