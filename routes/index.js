var express = require('express');
var moment = require('moment');
var Redis = require('ioredis');
var config = require('../config');

var router = express.Router();
var redis = new Redis(config.redis.port);

/* GET home page. */
router.get('/', function(req, res, next) {
	
	var data = {};
	
	redis.get('poloniex-last-update', function(err, last_update) {
		console.log('last_update: ' + last_update);
		res.render('index', { 'last_update': moment(last_update, 'x').fromNow() });
	}); 
});

module.exports = router;
