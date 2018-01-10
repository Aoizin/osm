var nodes = require('../models/nodes');
var relations = require('../models/relations');
var ways = require('../models/ways');
var jsts = require('jsts');
var geojsonReader = new jsts.io.GeoJSONReader();
var rest = require('restler');
var async = require('async');

exports.reverse = function (req, res) {
    var lat = Number(req.params.lat);
    var lon = Number(req.params.lon);
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
                        recuperaRodovia(req, res, point, retorno, ret ? result[ret.index] : {});
                    } else {
                        recuperaBairro(req, res, point, retorno);
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

function recuperaRodovia(req, res, point, retorno, way) {
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
                recuperaBairro(req, res, point, retorno);
            } else {
                recuperaCidade(req, res, point, retorno);
            }
        }
    });
}


function recuperaBairro(req, res, point, retorno) {
    var jstsPoint = geojsonReader.read(point);
    var filter = {
        "tags.admin_level": "10",
        "members.type": "node"
    };
    relations.find(filter, {"members.role.$": 1}, function (err, result) {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            var refs = [];
            result.forEach(function (r) {
                refs.push(r.members[0].ref);
            });
            nodes.find({_id: {'$in': refs}}, function (err, result) {
                if (err) {
                    console.log(err);
                    res.status(500).send(err);
                } else {
                    var way = sortJstsByPointDistance(result, jstsPoint);
                    if (way[0].distance < 0.05) {
                        retorno.address.suburb = result[way[0].index].tags.name;

                    }
                    recuperaCidade(req, res, point, retorno);
                }
            });
        }
    });
}


function recuperaCidade(req, res, point, retorno) {
    var jstsPoint = geojsonReader.read(point);
    var way = findIntesection(cities, jstsPoint);
    if (way.index) {
        retorno.address.city = cities[way.index].tags.name.pt ? cities[way.index].tags.name.pt : cities[way.index].tags.name;
    }
    recuperaEstado(req, res, point, retorno);
}

function recuperaEstado(req, res, point, retorno) {
    var jstsPoint = geojsonReader.read(point);
    var way = findIntesection(states, jstsPoint);
    if (way.index) {
        retorno.address.state = states[way.index].tags.name.pt ? states[way.index].tags.name.pt : states[way.index].tags.name;
    }
    recuperaPais(req, res, point, retorno);
}

function recuperaPais(req, res, point, retorno) {
    var jstsPoint = geojsonReader.read(point);
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
        "tags.admin_level": {'$in': ['2', '4', '8']},
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
            gerarPoligonos(res, result);
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

    

