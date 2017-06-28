/* trade.js
implements all functions related to a simulation portfolio */

var Redis = require('ioredis');
var async = require('async');
var _ = require('underscore');
var moment = require('moment');
var config = require('../config');
var portfolio = require('../model/portfolio');

var redis = new Redis(config.redis.port);

function record ( simulation, type, coin, amount, price, total, callback ){
	
	var trade_id;
	async.series([
		function(callback){
			// Get trade id...
			redis.incr(simulation + '-trade-counter', function(err, result){
				trade_id = result;
				callback();
			});
		},
		function(callback){
			// Insert trade ...
			var score = moment().format('x');
			redis.multi([
			  ['zadd', simulation + '-trades', score, trade_id],
			  ['hset', simulation + '-trade-' + trade_id, 'type', type],
			  ['hset', simulation + '-trade-' + trade_id, 'coin', coin],
			  ['hset', simulation + '-trade-' + trade_id, 'amount', amount],
			  ['hset', simulation + '-trade-' + trade_id, 'price', price],
			  ['hset', simulation + '-trade-' + trade_id, 'total', total]
			]).exec(function (err, results) {
				console.log('added trade in redis: check...');
				console.log(results);
				callback();
			});
		}
	], function(err){
		if (err) console.log('process: error inserting trade!');
		
		callback();
	});
}

function buy ( simulation, portfolio, coin, price, callback ) {
	
	console.log('buy ' + coin + ' @ ' + price);
	var net_worth = portfolio['value'];
	var base_coin = portfolio['base_coin'];
	var max_allocation = portfolio['max_allocation'];
	var available_funds = portfolio['coins'][base_coin];
	
	var available_coins = 0;
	if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin]; }
	
	if ( available_coins <= 0 &&  available_funds >= (max_allocation * net_worth)) {
		
		var pay = max_allocation * net_worth;
		var get = pay / price;
		var base_coin_after_trade = available_funds - pay;
		
		console.log('should get ' + get + ' ' + coin + ' coins @ ' + price);
		redis.multi([
		  ['sadd', simulation + '-portfolio-coins', coin],
		  ['set', simulation + '-portfolio-' + coin, get],
		  ['set', simulation + '-portfolio-' + base_coin, base_coin_after_trade]
		]).exec(function (err, results) {
			console.log('updated coin in redis: check...');
			console.log(results);
			record(simulation, 'buy', coin, get, price, pay, function(err){
				console.log('inserted trade in redis!');
				callback();
			});
		});
	} else {
		console.log('already have ' + coin + ' or do not have funds to buy!');
		console.log('available ' + coin + ':' + available_coins);
		console.log('available funds: ' + available_funds);
		callback();
	}
	
};

function sell ( simulation, portfolio, coin, price, callback ) {

	// console.log('sell ' + coin + ' @ ' + price);
	var base_coin = portfolio['base_coin'];
	var available_funds = portfolio['coins'][base_coin];
	
	var available_coins = 0;
	if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin]; }
	
	if ( available_coins > 0 ) {
	
		var get = available_coins * price;
		var base_coin_after_trade = available_funds + get;
		
		console.log('should get ' + get + ' ' + base_coin + ' @ ' + price);
		redis.multi([
		  ['srem', simulation + '-portfolio-coins', coin],
		  ['set', simulation + '-portfolio-' + coin, 0],
		  ['set', simulation + '-portfolio-' + base_coin, base_coin_after_trade],
		  ['hset', simulation + '-counter', coin, moment().format('x')]
		]).exec(function (err, results) {
			console.log('updated coin in redis: check...');
			console.log(results);
			record(simulation, 'sell', coin, available_coins, price, get,  function(err){
				console.log('inserted trade in redis!');
				callback();
			});
		});
	
	} else{
		console.log('do not have ' + coin + ', nothing to sell!');
		callback();
	}
};

exports.process = function(trade, callback) {
	
	var simulation = trade['simulation'];
	var pfolio = {};
	
	async.series([
	
		function(callback){
			// Get portfolio
			portfolio.getPortfolio(simulation, function(err, result){
				pfolio = result;
				callback();
			});
		},
		
		function(callback){
			// process trade based on type
			switch(trade['type']){
				case 'buy':
					buy(simulation, pfolio, trade['coin'], trade['last'], function(err){
						if (err) console.log('process: error processing buy trade!');
						callback();
					});
					break;
				case 'sell':
					sell(simulation, pfolio, trade['coin'], trade['last'], function(err){
						if (err) console.log('process: error processing sell trade!');
						callback();
					});
					break;
				default:
					console.log('invalid trade type: ' + trade['type']);
					callback();
			}
			
		}
	
	], function(err){
		if (err) console.log('process: error processing trade!');
		
		callback();
	});
	
};

exports.getHistory = function(simulation, callback){
	
	var trade_history = {};
	
	async.series([
		function(callback){
			redis.zrangebyscore(simulation + '-trades', '-inf', '+inf', 'WITHSCORES', function(err, results){
				var l = results.length;
				if( l%2 === 0 ) {
					for (var i = 0; i < l/2; i++){
						console.log('i is:' + i);
						trade_history[results[i*2]] = { 'timestamp' : results[(i*2)+1], 'human_time' : moment(results[(i*2)+1], 'x').format('YYYY-MM-DD HH:mm:ss.SSS')  };
					}
				}
				callback();
			});
		},
		function(callback){
			async.each( _.keys(trade_history), function(trade_id, callback){
				redis.hgetall(simulation + '-trade-' + trade_id, function(err, results){
					console.log(results);
					trade_history[trade_id] = _.extend(trade_history[trade_id], results);
					callback();
				});
			},function(err){
				if (err) console.log('error getting trade details');
				callback();
			});
		}
	], function(err){
		if (err) console.log('error getting trade history');
		console.log(trade_history);
		callback(null, trade_history);
	});

};