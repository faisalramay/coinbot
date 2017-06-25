/* trade.js
implements all functions related to a simulation portfolio */

var Redis = require('ioredis');
var async = require('async');
var _ = require('underscore');
var config = require('../config');
var portfolio = require('../model/portfolio');

var redis = new Redis(config.redis.port);

var sim_duration = 4;
var sim_max_allocation = 0.3;

function buy ( simulation, portfolio, coin, price, callback ) {
	
	console.log('buy ' + coin + ' @ ' + price);
	var net_worth = portfolio['value'];
	var base_coin = portfolio['base_coin'];
	var available_funds = portfolio['coins'][base_coin];
	
	var available_coins = 0;
	if ( portfolio['coins'][coin] ) { available_coins = portfolio['coins'][coin]; }
	
	if ( available_coins <= 0 &&  available_funds >= (sim_max_allocation * net_worth)) {
		
		var pay = sim_max_allocation * net_worth;
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
			callback();
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
	var available_funds = portfolio['USDT'];
	
	var available_coins = 0;
	if ( portfolio[coin] ) { available_coins = portfolio[coin]; }
	
	if ( available_coins > 0 ) {
	
		var get = available_coins * price;
		var base_coin_after_trade = available_funds + get;
		
		console.log('should get ' + get + ' ' + USDT + ' coins @ ' + price);
		redis.multi([
		  ['srem', simulation + '-portfolio-coins', coin],
		  ['set', simulation + '-portfolio-' + coin, 0],
		  ['set', simulation + '-portfolio-' + base_coin, base_coin_after_trade],
		  ['hset', simulation + '-counter', coin, moment().format('x')]
		]).exec(function (err, results) {
			console.log('updated coin in redis: check...');
			console.log(results);
			callback();
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