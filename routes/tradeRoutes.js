const express = require('express');
const router = express.Router();
const tradeController = require('../controllers/tradeController');
const { protect } = require('../middleware/auth');

// Rotas para operações de trading
router.post('/trades', protect, tradeController.createTrade);
router.get('/trades/active', protect, tradeController.getActiveTradesByRoom);
router.get('/trades', protect, tradeController.getUserTrades);
router.put('/trades/:id/close', protect, tradeController.closeTrade);
router.put('/trades/:id/stoploss', protect, tradeController.setStopLoss);
router.put('/trades/:id/takeprofit', protect, tradeController.setTakeProfit);

module.exports = router;