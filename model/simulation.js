/* simulation.js
implements the functions relates to simulation */

var Redis = require('ioredis');
var async = require('async');
var _ = require('underscore');
var moment = require('moment');
var config = require('../config');

var redis = new Redis(config.redis.port);

var sim_duration = 4;
var sim_max_allocation = 0.3;


exports.filterTrades = function(trades, portfolio, callback){
	
	var execute_trades = [];
	
	async.each(trades, function(trade, callback){
		switch( trade['type'] ){
			case 'buy':
				
				var coin = trade['coin'];
				var net_worth = portfolio['value'];
				var base_coin = portfolio['base_coin'];
				var available_funds = portfolio['coins'][base_coin];
				
				var available_coins = 0;
				if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin] }
				
				if ( available_coins <= 0 &&  available_funds >= (sim_max_allocation * net_worth)) {
					execute_trades.push(trade);
				} else {
					console.log('already have ' + coin + ' or do not have funds to buy!');
					console.log('available ' + coin + ':' + available_coins);
					console.log('available funds: ' + available_funds);
				}
				break;
			case 'sell':
				var coin = trade['coin'];
				var available_coins = 0;
				if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin] }
				if ( available_coins > 0 ) {
					execute_trades.push(trade);
				} else {
					console.log('do not have ' + coin + ', nothing to sell!');
				}
				break;
			default:
				console.log('invalid trade type: ' + trade['type']);
		}
		callback();
	}, function(err){
		if(err) console.log('error filtering trades!');
		callback(null, execute_trades);
	});
};

exports.initializeSimulation = function(simulation, coins, buy_at, sell_at, callback){
	
	async.each( coins, function(coin, callback){
		console.log('adding ' + coin + ' to watching set...');
		redis.sadd(simulation + '-watching', coin);
		redis.set(simulation + '-buy-at-' + coin, buy_at);
		redis.set(simulation + '-sell-at-' + coin, sell_at);
		callback();
		
	}, function(err){
		if (err) console.log('error creating watching set in redis...');
		
		callback();
	});
};

exports.getWatchedCoins = function(simulation, callback){
	
	redis.smembers(simulation + '-watching', function(err, results){
		callback(err, results);
	});
};

exports.processTicker = function(simulation, ticker, callback) {

	var coin = ticker.split('_')[1];
	
	var history = [];
	var buy_at = 0;
	var sell_at = 0;
	var last = 0;
	var trade = {};
	
	async.parallel([

		function (callback) {
			// get buy at price for coin
			redis.get(simulation + '-buy-at-' + coin, function(err, result) {
				buy_at = result;
				callback();
			}); 
		},
		
		function (callback) {
			// get sell at price for coin
			redis.get(simulation + '-sell-at-' + coin, function(err, result) {
				sell_at = result;
				callback();
			}); 
		},
		
		function (callback) {
		
			redis.hget(simulation + '-counter', coin, function(err, results){
				
				var start_time = results;
				if ( ! results ) {
					start_time = moment().format('x');
					redis.hset(simulation + '-counter', coin, start_time);
				}
				
				if ( start_time - moment().subtract(sim_duration, 'hour').format('x') <= 0 ) {
					console.log('reset counter for ' + coin + ' @ 6 HOURS');
					start_time = moment().format('x');
					redis.hset(simulation + '-counter', coin, start_time);
				}
				
				redis.zrangebyscore('price-history-' + ticker, start_time, '+inf', function(err, result) {
					history = result;
					callback();
				}); 
			});
			
		},

		function (callback) {
			// get last price
			redis.get('price-last-' + ticker, function(err, result) {
				last = result;
				callback();
			}); 
		}
		
	], function(err){
		if (err) console.log('error processing ticker: ' + ticker);
		
		// need to implement a check on how many coins we are invested in...
		//if ( last > (buy_at * _.min(history)) ) buy(simulation, portfolio, coin, last);
		//if ( last < (sell_at * _.max(history)) ) sell(simulation, portfolio, coin, last);
		if ( last > (buy_at * _.min(history)) ) trade = { 'type': 'buy', 'simulation': simulation, 'coin': coin, 'last': last};
		if ( last < (sell_at * _.max(history)) ) trade = { 'type': 'sell', 'simulation': simulation, 'coin': coin, 'last': last};
		callback(null, trade);
	});
};