var express = require('express');
var router = express.Router();
var Redis = require('ioredis');
var async = require('async');
var moment = require('moment');
var _ = require('underscore');
var config = require('../config');

var redis = new Redis(config.redis.port);

/* GET users listing. */
router.get('/:ticker', function(req, res, next) {
	
	var ticker = req.params.ticker;
	var price = { 'min': 0, 'max': 0, 'last': 0, 'history': []};
	
	async.parallel([
	
		function(callback){
			// get minimum price
			redis.get('price-min-' + ticker, function(err, min) {
				price.min = min;
				callback();
			}); 
		},
		
		function(callback){
			// get maximum price
			redis.get('price-max-' + ticker, function(err, max) {
				price.max = max;
				callback();
			}); 
		},
		
		function(callback){
			// get last price
			redis.get('price-last-' + ticker, function(err, last) {
				price.last = last;
				callback();
			}); 
		},
		
		function(callback){
			// get price history
			// get last 6 hours only ...
			var score_from = moment().subtract(6, 'hour').format('x');
			
			//redis.zrangebyscore('price-history-' + ticker, score_from, '+inf', 'WITHSCORES', function(err, p_history) {
			redis.zrangebyscore('price-history-' + ticker, score_from, '+inf', function(err, p_history) {
				price.history = p_history;
				callback();
			}); 
		}
	
	], function(err){
		if (err) console.log('error getting prices for ticker: ' + ticker);
		res.render('ticker', { ticker: ticker, price: price});
	});
  
});

module.exports = router;
