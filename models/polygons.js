// Load required packages
var mongoose = require('mongoose');

// Define schema
var Polygon_Schema = new mongoose.Schema({
   _id: {type:Number, index:true, unique:true},
    type: {type:String, default:"relation"},
    loc: {},
    tags: {}
  });

Polygon_Schema.set("versionKey", false);
// Export the Mongoose model
module.exports = mongoose.model('polygons', Polygon_Schema);