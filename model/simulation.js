/* simulation.js
implements the functions relates to simulation */

var Redis = require('ioredis');
var async = require('async');
var _ = require('underscore');
var moment = require('moment');
var config = require('../config');

var redis = new Redis(config.redis.port);

exports.filterTrades = function(trades, portfolio, callback){
	
	var execute_trades = [];
	
	async.each(trades, function(trade, callback){
		switch( trade['type'] ){
			case 'buy':
				
				var coin = trade['coin'];
				var net_worth = portfolio['value'];
				var base_coin = portfolio['base_coin'];
				var max_allocation = portfolio['max_allocation'];
				var available_funds = portfolio['coins'][base_coin];
				
				var available_coins = 0;
				if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin] }
				
				if ( available_coins <= 0 &&  available_funds >= (max_allocation * net_worth)) {
					execute_trades.push(trade);
				}
				/* else {
					console.log('already have ' + coin + ' or do not have funds to buy!');
					console.log('available ' + coin + ':' + available_coins);
					console.log('available funds: ' + available_funds);
				} */
				break;
				
			case 'sell':
			
				var coin = trade['coin'];
				var available_coins = 0;
				if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin] }
				if ( available_coins > 0 ) {
					execute_trades.push(trade);
				}
				// else { console.log('do not have ' + coin + ', nothing to sell!'); }
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

exports.initializeSimulation = function(simulation, coins, buy_at, sell_at, duration, callback){
	
	async.each( coins, function(coin, callback){
		console.log('adding ' + coin + ' to watching set...');
		redis.sadd(simulation + '-watching', coin);
		redis.set(simulation + '-buy-at-' + coin, buy_at);
		redis.set(simulation + '-sell-at-' + coin, sell_at);	
		callback();
		
	}, function(err){
		if (err) console.log('error creating watching set in redis...');
		
		redis.sadd('simulations', simulation);
		redis.set(simulation + '-duration', duration);
		callback();
	});
};

exports.getWatchedCoins = function(simulation, callback){
	
	redis.smembers(simulation + '-watching', function(err, results){
		callback(err, results);
	});
};

exports.getSimulations = function(callback){
	
	redis.smembers('simulations', function(err, results){
		callback(err, results);
	});
};

exports.getWatchedCoinsWithDetails = function(simulation, callback){
	
	var list = [];
	var watching = {};
	
	async.series([
		function(callback){
			// Get the list
			redis.smembers(simulation + '-watching', function(err, results){
				list = results;
				callback();
			});
		},
		
		function(callback){
			// Get details for each coin
			async.each(list, function(coin, callback){
				// Get all details in parallel
				var this_coin = {};
				async.parallel([
					function(callback){
						redis.get(simulation + '-buy-at-' + coin, function(err, buy_at){
							this_coin['buy_at'] = buy_at;
							callback();
						});
					},
					function(callback){
						redis.get(simulation + '-sell-at-' + coin, function(err, sell_at){
							this_coin['sell_at'] = sell_at;
							callback();
						});
					},
					function(callback){
						redis.get('price-last-USDT_' + coin, function(err, price){
							this_coin['price'] = price;
							callback();
						});
					},
					function(callback){
						redis.hget(simulation + '-counter', coin, function(err, counter){
							this_coin['counter'] = counter;
							this_coin['human_counter'] = moment(counter, 'x').format('YYYY-MM-DD HH:mm:ss.SSS');
							redis.zrangebyscore('price-history-USDT_' + coin, counter, '+inf', function(err, results) {
								this_coin['min'] = _.min(results);
								this_coin['max'] = _.max(results);
								callback();
							}); 
						});
					}
					
				], function(err){
					if(err) console.log('error getting some details for a particular coin');
					watching[coin] = _.extend({'coin': coin}, this_coin);
					callback();
				});
			}, function(err){
				if(err) console.log('error getting details of all coins');
				callback();
			});
		},
		
	], function(err){
		if(err) console.log('error getting watched coin details');
		console.log(watching);
		callback(null, watching);
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
			
			redis.get(simulation + '-duration', function(err, duration){
				redis.hget(simulation + '-counter', coin, function(err, results){
				
					var start_time = results;
					if ( ! results ) {
						start_time = moment().format('x');
						redis.hset(simulation + '-counter', coin, start_time);
					}
					
					if ( start_time - moment().subtract(duration, 'hour').format('x') <= 0 ) {
						console.log('reset counter for ' + coin + ' @ 6 HOURS');
						start_time = moment().format('x');
						redis.hset(simulation + '-counter', coin, start_time);
					}
					
					redis.zrangebyscore('price-history-' + ticker, start_time, '+inf', function(err, result) {
						history = result;
						callback();
					}); 
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
		
		if ( last > (buy_at * _.min(history)) ) {
			trade = { 'type': 'buy', 'simulation': simulation, 'coin': coin, 'last': last};
			console.log('buy ' + coin + ' @ ' + last + ', min: ' + _.min(history) + ', threshold: ' + (buy_at * _.min(history)));
		}
		
		if ( last < (sell_at * _.max(history)) ) {
			trade = { 'type': 'sell', 'simulation': simulation, 'coin': coin, 'last': last};
			console.log('sell ' + coin + ' @ ' + last + ', max: ' + _.max(history) + ', threshold: ' + (sell_at * _.max(history)));
		}
		
		callback(null, trade);
	});
};