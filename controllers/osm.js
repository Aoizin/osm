var nodes = require('../models/nodes');
var relations = require('../models/relations');
var ways = require('../models/ways');
var places = require('../models/places');
var jsts = require('jsts');
var geojsonReader = new jsts.io.GeoJSONReader();
var rest = require('restler');
var async = require('async');
var polygons = require('../models/polygons');
var q = require('q');

exports.reverse = function (req, res) {
    var lat = Number(req.query.lat);
    var lon = Number(req.query.lon);
    if (!lat || !lon) {
        res.status(409).send({message: 'Informar latitude e longitude'});
        return;
    }

    var point = {
        type: 'Point',
        coordinates: [lon, lat]
    };

    var filter = {
        loc: {
            $near: {
                $geometry: point,
                $maxDistance: 500
            }
        }
    };

    nodes.find(filter, {"_id": 1}, function (err, result) {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            if (result.length == 0) {
                res.json({message: 'Não foi possível encontrar o endereço'});
                return;
            }
            var nodes = [];
            result.forEach(function (doc) {
                nodes.push(doc._id);
            });
            filter = {
                nodes: {'$in': nodes},
                'tags.highway': {$exists: true}
            };
            ways.find(filter, {"tags": 1, "loc": 1}, function (err, result) {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    if (result.length == 0) {
                        res.json({message: 'Não foi possível encontrar o endereço'});
                        return;
                    }
                    // Convert geometries to JSTS
                    var jstsPoint = geojsonReader.read(point);
                    var way = sortJstsByPointDistance(result, jstsPoint);
                    var nearWay = result[way[0].index];
                    var retorno = {osm_id: nearWay._id, osm_type: "way", lat: lat, lon: lon};
                    retorno.address = {
                        road: nearWay.tags.name ? nearWay.tags.name : nearWay.tags.description,
                        suburb: "",
                        city: "",
                        state: "",
                        country: ""
                    };
                    retorno.extratags = {
                        maxspeed : nearWay.tags.maxspeed,
                        highway : nearWay.tags.highway,
                        oneway : nearWay.tags.oneway
                    };
                    if (!retorno.address.road) {
                        var ret = way[1];
                        recuperaRodovia(req, res, jstsPoint, retorno, ret ? result[ret.index] : {});
                    } else {
                        recuperaBairro(req, res, jstsPoint, retorno);
                    }
                }

            });
        }
    });

};

function sortJstsByPointDistance(result, jstsPoint) {
    var way = [];
    result.forEach(function (polygon, index) {
        var jstsPolygon = geojsonReader.read(polygon.loc);
        way.push({distance: jstsPoint.distance(jstsPolygon), index: index});
    });
    way.sort(function (a, b) {
        return a.distance - b.distance
    });
    return way;
}

function recuperaRodovia(req, res, jstsPoint, retorno, way) {
    var filter = {
        "members.ref": retorno.osm_id
    };
    relations.findOne(filter, {"tags": 1}, function (err, result) {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            retorno.address.road = result && result.tags ? result.tags.ref : "";
            if (!retorno.address.road && way._id) {
                retorno.osm_id = way._id;
                retorno.address = {
                    road: way.tags.name ? way.tags.name : way.tags.description,
                    suburb: "",
                    city: "",
                    state: "",
                    country: ""
                };
                recuperaBairro(req, res, jstsPoint, retorno);
            } else {
                recuperaCidade(req, res, jstsPoint, retorno);
            }
        }
    });
}


function recuperaBairro(req, res, jstsPoint, retorno) {
    var way = findIntesection(suburbs, jstsPoint);
    if (way.index) {
        retorno.address.suburb = suburbs[way.index].tags.name.pt ? suburbs[way.index].tags.name.pt : suburbs[way.index].tags.name;
    }
    recuperaCidade(req, res, jstsPoint, retorno);
}


function recuperaCidade(req, res, jstsPoint, retorno) {
    var way = findIntesection(cities, jstsPoint);
    if (way.index) {
        retorno.address.city = cities[way.index].tags.name.pt ? cities[way.index].tags.name.pt : cities[way.index].tags.name;
    }
    recuperaEstado(req, res, jstsPoint, retorno);
}

function recuperaEstado(req, res, jstsPoint, retorno) {

    var way = findIntesection(states, jstsPoint);
    if (way.index) {
        retorno.address.state = states[way.index].tags.name.pt ? states[way.index].tags.name.pt : states[way.index].tags.name;
    }
    recuperaPais(req, res, jstsPoint, retorno);
}

function recuperaPais(req, res, jstsPoint, retorno) {
    var way = findIntesection(countries, jstsPoint);
    if (way.index) {
        retorno.address.country = countries[way.index].tags.name.pt ? countries[way.index].tags.name.pt : countries[way.index].tags.name;
    }
    res.json(retorno);
}

function findIntesection(result, jstsPoint) {
    var way = {};
    for (var i = 0; i < result.length; i++) {
        var jstsPolygon = geojsonReader.read(result[i].loc);
        if (jstsPoint.intersects(jstsPolygon)) {
            way = {index: i};
            break;
        }
    }
    return way;
}

exports.gerarPoligonos = function (req, res) {
    var filter = {
        "tags.admin_level": {'$in': ['2', '4', '8', '10']},
        'loc': {$exists: false},
        'noloc': {$exists: false}
    };
    relations.find(filter, function (err, result) {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            console.log(result.length);
            res.json({});
            gerarPoligonos(result);
        }
    });
}

function gerarPoligonos(relationsArray) {
    async.eachSeries(relationsArray, function (relation, callback) {
        rest.get('http://polygons.openstreetmap.fr/get_geojson.py?id=' + relation._id + '&params=0').on('complete', function (data) {
            try {
                var poly = JSON.parse(data);
            } catch (e) {
            }
            if (poly) {
                relations.update({"_id": relation._id}, {$set: {loc: JSON.parse(data)}}, function (error, nrows) {
                    if (error) {
                        console.log(error);
                        callback(error);
                    } else {
                        console.log("_id:" + relation._id);
                        setTimeout(callback, 2000);
                    }
                });
            } else {
                relations.update({"_id": relation._id}, {$set: {noloc: true}}, function (error, nrows) {
                    if (error) {
                        console.log(error);
                        callback(error);
                    } else {
                        console.log("_id:" + relation._id);
                        setTimeout(callback, 2000);
                    }
                });
            }

        });
    }, function (err) {
        if (err) {
            console.log(err);
        } else {
            console.log('Done!');
        }

    });
};

exports.gerarPlaces = function (req, res) {
    places.find({}, '_id', { skip: 0, limit: 1,  sort:{_id: -1 }},function (err, result) {
        if(err){
            console.log(err);
            return res.status(500).send(err);
        }
        var lastId;
        if(result[0]){
            lastId = result[0]._id;
        }
        var i = 0;
        async.doUntil(function(end) {
            getWays(i, lastId).then(function (hasNext) {
                if(hasNext){
                    i++;
                }
                setTimeout(end, 100);
            }).catch(function (e) {
                end(e);
            })
        }, function(hasNext) {
            return hasNext;
        }, function(err) {
            if (err) {
                console.log(err);
            } else {
                console.log('Done!');
            }
        });
        res.json({});
    });

};

function getWays(i, lastId) {
    var filter = {
        "loc.type": "LineString",
        $or: [ { 'tags.name': {$exists: true} }, { 'tags.description': {$exists: true} } ],
    };
    if(lastId){
        filter._id = {'$gt': lastId}
    }
    var deferred = q.defer();
    ways.find(filter, '_id type nodes loc tags', { skip: i*100, limit: 100,  sort:{_id: 1 }}, function (err, result) {
        if (err) {
            console.log(err);
            deferred.reject(err);
        } else {
            var hasNext = result.length == 100;
            var bulk = [];
            async.eachSeries(result, function (r, callback) {
                var nearWay = r.toJSON();
                var retorno = {_id: nearWay._id, osm_type: "way", loc: nearWay.loc, nodes: nearWay.nodes};
                retorno.address = {
                    road: nearWay.tags.name ? nearWay.tags.name : nearWay.tags.description,
                    suburb: "",
                    city: "",
                    state: "",
                    country: ""
                };
                retorno.extratags = {
                    maxspeed : nearWay.tags.maxspeed,
                    highway : nearWay.tags.highway,
                    oneway : nearWay.tags.oneway
                };

                var filter = {
                    "loc": {
                        $geoIntersects: {
                            $geometry: nearWay.loc
                        }
                    }
                };

                polygons.find(filter, {"tags": 1}, {sort: {"_id": -1}}, function (err, list) {
                    if(err){
                        return callback(err);
                    }
                    var suburbs = list.filter(function(r){
                            return r.tags.admin_level == '10';
                        }
                    );
                    if(suburbs[0]){
                        retorno.address.suburb = suburbs[0].tags.name.pt ? suburbs[0].tags.name.pt : suburbs[0].tags.name;
                    }
                    var cities = list.filter(function(r){
                            return r.tags.admin_level == '8';
                        }
                    );
                    if(cities[0]){
                        retorno.address.city = cities[0].tags.name.pt ? cities[0].tags.name.pt : cities[0].tags.name;
                    }
                    var states = list.filter(function(r){
                            return r.tags.admin_level == '4';
                        }
                    );
                    if(states[0]){
                        retorno.address.state = states[0].tags.name.pt ? states[0].tags.name.pt : states[0].tags.name;
                    }
                    var countries = list.filter(function(r){
                            return r.tags.admin_level == '2';
                        }
                    );
                    if(countries[0]){
                        retorno.address.country = countries[0].tags.name.pt ? countries[0].tags.name.pt : countries[0].tags.name;
                    }
                    bulk.push(retorno);
                    callback();
                });

            }, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    places.collection.insert(bulk, function (error, nrows) {
                        if (error) {
                            console.log(err);
                            deferred.reject(err);
                        } else {
                            deferred.resolve(hasNext);
                        }
                    });
                }

            });

        }
    });
    return deferred.promise;
}


exports.reverse = function (req, res) {
    var lat = Number(req.query.lat);
    var lon = Number(req.query.lon);
    if (!lat || !lon) {
        res.status(409).send({message: 'Informar latitude e longitude'});
        return;
    }

    var point = {
        type: 'Point',
        coordinates: [lon, lat]
    };

    var filter = {
        "loc": {
            $near: {
                $geometry: point,
                $maxDistance: 50
            }
        },
        "address.road": {$ne: null}
    };

    places.find(filter, '_id osm_type address extratags', { skip: 0, limit: 1,  sort:{_id: -1 }}, function (err, result) {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            if (result[0]) {
                res.json(result[0]);
            } else {
                res.json({message: 'Não foi possível encontrar o endereço'});
            }

        }
    });

};
    

