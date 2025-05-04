const express = require('express');
const router = express.Router();
const candleController = require('../controllers/candleController');


router.get('/history', candleController.getCandles);
router.get('/current', candleController.getCurrentCandle);
router.get('/candles/range', candleController.getCandlesByRange);

module.exports = router;