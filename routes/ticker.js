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
	var price = { 'last': 0, 'history': []};
	
	async.parallel([
		
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
			
			redis.zrangebyscore('price-history-' + ticker, score_from, '+inf', 'WITHSCORES', function(err, results) {
			//redis.zrangebyscore('price-history-' + ticker, score_from, '+inf', function(err, p_history) {
				
				var l = results.length;
				if( l%2 === 0 ) {
					for (var i = 0; i < l/2; i++){
						price['history'].push({
							'price' : results[(i*2)],
							'timestamp' : results[(i*2)+1],
							'human_time' : moment(results[(i*2)+1], 'x').format('YYYY-MM-DD HH:mm:ss.SSS')
						});
					}
				}
				
				callback();
			}); 
		}
	
	], function(err){
		if (err) console.log('error getting prices for ticker: ' + ticker);
		res.render('ticker', { ticker: ticker, price: price});
	});
  
});

module.exports = router;
