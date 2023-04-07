const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  username: {
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

const EndpointAccess = mongoose.model("endpointAccess", schema);
module.exports = EndpointAccess