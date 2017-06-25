var express = require('express');
var router = express.Router();
var Redis = require('ioredis');
var async = require('async');
var moment = require('moment');
var _ = require('underscore');
var config = require('../config');
var portfolio = require('../model/portfolio');

var redis = new Redis(config.redis.port);

/* GET users listing. */
router.get('/:simulation', function(req, res, next) {
	
	var sim = req.params.simulation;
	var data = { 'simulation': sim, 'watching': [], portfolio: {}};
	
	async.parallel([
	
		function(callback){
			// get buy_at price
			redis.smembers(sim + '-watching', function(err, results) {
				async.each(results, function(coin, callback){
					redis.get(sim + '-buy-at-' + coin, function(err, buy_at){
						redis.get(sim + '-sell-at-' + coin, function(err, sell_at){
							data['watching'].push({
								'coin': coin,
								'buy_at': buy_at,
								'sell_at': sell_at
							});
							callback();
						})
					});
					
					
				}, function(err){
					if (err) console.log('error creating portfolio in redis...');
					callback();
				});
			}); 
		},
		
		function(callback){
			
			portfolio.getPortfolio(sim, function(err, result){
				data['portfolio'] = result;
				callback();
			});
		}
	
	], function(err){
		if (err) console.log('error getting prices for ticker: ' + ticker);
		console.log(data);
		res.render('simulation', data);
	});
  
});

router.get('/:simulation/set/:parameter', function(req, res, next){
	
	var sim = req.params.simulation;
	var param = req.params.parameter;
	
	var data = { 'simulation': sim, 'parameter': param, 'value': 0};
	
	if( req.query.value ) {
		console.log('setting ' + param +' to value: ' + req.query.value);
		redis.set(param, req.query.value);
		res.redirect('/simulation/' + sim);
	} else {
		redis.get(param, function(err, result){
			data['value'] = result;
			res.render('simulation_set', data);
		});
	}
	
});

module.exports = router;
