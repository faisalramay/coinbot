var express = require('express');
var async = require('async');
var moment = require('moment');
var Redis = require('ioredis');
var config = require('../config');
var simulation = require('../model/simulation');

var router = express.Router();
var redis = new Redis(config.redis.port);

/* GET home page. */
router.get('/', function(req, res, next) {
	
	var data = {};
	
	async.parallel([
		function(callback){
			redis.get('poloniex-last-update', function(err, last_update) {
				data['last_update'] = moment(last_update, 'x').fromNow();
				callback();
			});
		},
		function(callback){
			simulation.getSimulations(function(err, results){
				data['simulations'] = results;
				callback();
			});
		}
	], function(err){
		
		res.render('index', data);
	});
	
});

module.exports = router;
