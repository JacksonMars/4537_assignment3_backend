const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  error: {
    type: String,
    required: true
  },
  time: {
    type: Date
  },
  endpoint: {
    type: String
  }
});

const Error = mongoose.model("error", schema);
module.exports = Error