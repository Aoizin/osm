// Load required packages
var mongoose = require('mongoose');

// Define schema
var Place_Schema = new mongoose.Schema({
    _id: {type: Number, index:true, unique:true},
    osm_type: {type:String, default:"way"},
    nodes: { type: Array, default:[]},
    loc: {
      type: { type: String },
      coordinates: []
    },
    address: {},
    extratags: {}
});

Place_Schema.set("versionKey", false);
// Export the Mongoose model
module.exports = mongoose.model('places', Place_Schema);