// Load required packages
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var ejs = require('ejs');
var session = require('express-session');
var config = require('./config/config');
var osm = require('./controllers/osm');
// Include the cluster module
var cluster = require('cluster');
var q = require('q');
cities = null;
states = null;
countries = null;

// Code to run if we're in the master process
if (config.enable_node_cluster && cluster.isMaster) {
// Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

// Code to run if we're in a worker process
} else {

    var deferred = q.defer();
    // Connect to the beerlocker MongoDB
    var db = mongoose.connection;

    db.on('connecting', function () {
        console.info('MongoDB: Conectando...');
    });
    db.on('error', function (error) {
        console.error('Error na conexão MongoDB: ' + error);
        mongoose.disconnect();
    });
    db.on('connected', function () {
        console.info('MongoDB: conectado!');
        deferred.resolve();
    });
    db.once('open', function () {
        console.info('MongoDB: conexão aberta!');
    });
    db.on('reconnected', function () {
        console.info('MongoDB: reconectado!');
    });
    db.on('disconnected', function () {
        console.error('MongoDB desconectado!');
    });

    mongoose.connect(config.db.url, config.db.options);

    // Create our Express application
    var app = express();

    app.use(function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
        next();
    });

    // Set view engine to ejs
    //app.set('view engine', 'ejs');

    // Use the body-parser package in our application
    app.use(bodyParser.json({type: function(req){
            return /^(text\/plain|.*\/json)$/i.test((req.headers["content-type"] || "").split(";")[0]);
        }})
    );
    app.use(bodyParser.urlencoded({
        extended: true
    }));
    app.use(bodyParser.text({defaultCharset:'utf-8'}));

    // Use express session support since OAuth2orize requires it
    app.use(session({
        secret: 'Super Secret Session Key',
        saveUninitialized: true,
        resave: true
    }));


    // Create our Express router
    var router = express.Router();

    router.route('/osm')
        .get(osm.reverse);

    router.route('/gerarPoligonos')
        .get(osm.gerarPoligonos);

    // Register all our routes with /api
    app.use('/api', router);

    deferred.promise.then(function () {
        console.log("Carregando geometrias");
        var relations = require('./models/relations');
        var filter = {
            "tags.admin_level": '8',
            'loc': {$exists: true}
        };
        relations.find(filter, {"tags": 1, "loc": 1})
            .then(function (result) {
                cities = result;
                var filter = {
                    "tags.admin_level": '4',
                    'loc': {$exists: true}
                };
                return relations.find(filter, {"tags": 1, "loc": 1})

            })
            .then(
                function (result) {
                    states = result;
                    var filter = {
                        "tags.admin_level": '2',
                        'loc': {$exists: true}
                    };
                    return relations.find(filter, {"tags": 1, "loc": 1});
                }
            )
            .then(function (result) {
                countries = result;
                // Start the server
                console.log("Server started!");
                app.listen(3001);
            })
            .catch(function (err) {
                console.error(err);
            });
    }).catch(function (err) {
        console.error(err.stack);
    });
}