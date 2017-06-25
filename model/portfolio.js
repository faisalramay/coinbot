/* portfolio.js
implements all functions related to a simulation portfolio */

var Redis = require('ioredis');
var async = require('async');
var _ = require('underscore');
var config = require('../config');

var redis = new Redis(config.redis.port);

exports.initializePortfolio = function(simulation, coins, base_coin, callback) {
	
	async.each( _.keys(coins), function(coin, callback){
		console.log('adding ' + coins[coin] + ' ' + coin + ' to portfolio...');
		redis.sadd(simulation + '-portfolio-coins', coin);
		redis.set(simulation + '-portfolio-' + coin, coins[coin]);
		callback();
		
	}, function(err){
		if (err) console.log('error creating portfolio in redis...');
		
		console.log('setting base coin to ' + base_coin + '...');
		redis.set(simulation + '-portfolio-base_coin', base_coin);
		callback();
	});
};

exports.getPortfolio = function(simulation, callback) {
	
	var portfolio = {};
	var base_coin;
	var coins = {};
	var value_by_coin = [];
	var value;
	
	async.series([
	
		function(callback){
			// Get all coins we are holding
			redis.smembers(simulation + '-portfolio-coins', function(err, results){
				// How much of each coin are we holding
				async.each(results, function(coin, callback){
					redis.get(simulation + '-portfolio-' + coin, function(err, result){
						coins[coin] = 0;
						if ( result ) coins[coin] = Number(result);
						callback();
					});
				}, function(err){
					if (err) console.log('error getting portfolio from redis...');
					
					redis.get(simulation + '-portfolio-base_coin', function(err, result){
						base_coin = result;
						callback();
					});
				});
			});
		},
		
		function(callback){
			// Calculate the value of our portfolio
			if( base_coin && ! _.isEmpty(coins) ){
				async.each(_.keys(coins), function(coin, callback){
					if ( coin == base_coin){
						value_by_coin.push(coins[coin]);
						callback();
					} else {
						var ticker = [base_coin, coin].join('_');
						redis.get('price-last-' + ticker, function(err, price){
							var v = price * coins[coin];
							// console.log('I have ' + v + ' worth of ' + coin);
							value_by_coin.push(v);
							callback();
						});
					}
					
				}, function(err){
					if (err) console.log('error getting portfolio from redis...');
					
					value = _.reduce(value_by_coin, function(memo, num){ return memo + num; }, 0);
					callback();
				});
				
			} else {
				value = 0;
				callback();
			}
			
		}
	
	], function(err){
		if (err) console.log('getPortfolio: error getting portfolio from redis!');
		
		portfolio = {
			coins: coins,
			base_coin: base_coin,
			value: value
		};
		callback(null, portfolio);
	});
	
};