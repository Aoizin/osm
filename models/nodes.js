// Load required packages
var mongoose = require('mongoose');

// Define schema
var Node_Schema = new mongoose.Schema({
    _id: {type: Number, index:true, unique:true},
    type: {type:String, default:"node"},
    loc: {
      type: Object,
      coordinates: [Number],
      index: "2dsphere"
    },
    osmTimeBucket: Object,
    updateTimeBucket: Object,
    version: Number,
    uid: Number,
    user: String,
    changeset: Number,
    timestamp: Date,
    visible: Boolean,
    tags: {}
  });

Node_Schema.set("versionKey", false);
// Export the Mongoose model
module.exports = mongoose.model('nodes', Node_Schema);