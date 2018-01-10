// Load required packages
var mongoose = require('mongoose');

// Define schema
var Way_Schema = new mongoose.Schema({
    _id: {type: Number, index:true, unique:true},
    type: {type:String, default:"way"},
    nodes: { type: Array, default:[]},
    loc: {
      type: { type: String },
      coordinates: []
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

Way_Schema.set("versionKey", false);
// Export the Mongoose model
module.exports = mongoose.model('ways', Way_Schema);