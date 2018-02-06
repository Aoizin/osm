// Load required packages
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var session = require('express-session');
var config = require('./config/config');
var osm = require('./controllers/osm');
// Include the cluster module
var cluster = require('cluster');
var q = require('q');

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

    router.route('/gerarPlaces')
        .get(osm.gerarPlaces);


    // Register all our routes with /api
    app.use('/api', router);

    deferred.promise.then(function () {
        // Start the server
        console.log("Server started!");
        app.listen(3001);
    }).catch(function (err) {
        console.error(err.stack);
    });
}