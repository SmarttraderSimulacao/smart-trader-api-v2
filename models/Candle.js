const mongoose = require('mongoose');

const CandleSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  open: { type: Number, required: true },
  high: { type: Number, required: true },
  low: { type: Number, required: true },
  close: { type: Number, required: true },
  volume: { type: Number, required: true },
  timeframe: { type: Number, default: 1 } // em minutos
});

module.exports = mongoose.model('Candle', CandleSchema);