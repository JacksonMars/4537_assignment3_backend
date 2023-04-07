const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },

  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    min: 3,
    max: 20
  }
});

module.exports = mongoose.model('refreshTokens', schema);