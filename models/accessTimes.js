const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    min: 3,
    max: 20
  },
  lastAccess: {
    type: Date
  }
});

const AccessTimes = mongoose.model("accessTimes", schema);
module.exports = AccessTimes