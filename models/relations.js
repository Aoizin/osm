// Load required packages
var mongoose = require('mongoose');

// Define schema
var Relation_Schema = new mongoose.Schema({
   _id: {type:Number, index:true, unique:true},
    type: {type:String, default:"relation"},
    loc: {},
    noloc: Boolean,
    members: [],
    version: Number,
    uid: Number,
    user: String,
    changeset: Number,
    timestamp: Date,
    visible: Boolean,
    osmTimeBucket: Object,
    updateTimeBucket: Object,
    tags: {}
  });

Relation_Schema.set("versionKey", false);
// Export the Mongoose model
module.exports = mongoose.model('relations', Relation_Schema);