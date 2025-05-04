const mongoose = require('mongoose');

const TradeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  type: {
    type: String,
    enum: ['LONG', 'SHORT'],
    required: true
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED', 'CANCELED'],
    default: 'OPEN'
  },
  entryPrice: {
    type: Number,
    required: true
  },
  exitPrice: {
    type: Number
  },
  size: {
    type: Number,
    default: 1
  },
  stopLoss: {
    type: Number
  },
  takeProfit: {
    type: Number
  },
  profit: {
    type: Number
  },
  entryTime: {
    type: Date,
    default: Date.now
  },
  exitTime: {
    type: Date
  },
  closedBy: {
    type: String,
    enum: ['USER', 'STOP_LOSS', 'TAKE_PROFIT', 'SYSTEM'],
  },
  entryCandle: {
    timestamp: Number,
    open: Number,
    high: Number,
    low: Number,
    close: Number
  },
  exitCandle: {
    timestamp: Number,
    open: Number,
    high: Number,
    low: Number,
    close: Number
  }
});

// Criar índices para consultas frequentes
TradeSchema.index({ userId: 1, roomId: 1, status: 1 });
TradeSchema.index({ roomId: 1, status: 1 });

// Método para calcular lucro ou prejuízo
TradeSchema.methods.calculatePnL = function(currentPrice) {
  if (this.status === 'CLOSED' && this.profit !== undefined) {
    return this.profit;
  }
  
  const price = currentPrice || this.exitPrice;
  if (!price) return 0;
  
  let pnl = 0;
  if (this.type === 'LONG') {
    pnl = (price - this.entryPrice) * this.size;
  } else {
    pnl = (this.entryPrice - price) * this.size;
  }
  
  return pnl;
};

// Método para verificar se atingiu stop loss ou take profit
TradeSchema.methods.checkStopLossAndTakeProfit = function(currentPrice) {
  if (this.status !== 'OPEN') return false;
  
  if (this.type === 'LONG') {
    if (this.stopLoss && currentPrice <= this.stopLoss) {
      return 'STOP_LOSS';
    }
    if (this.takeProfit && currentPrice >= this.takeProfit) {
      return 'TAKE_PROFIT';
    }
  } else { // SHORT
    if (this.stopLoss && currentPrice >= this.stopLoss) {
      return 'STOP_LOSS';
    }
    if (this.takeProfit && currentPrice <= this.takeProfit) {
      return 'TAKE_PROFIT';
    }
  }
  
  return false;
};

module.exports = mongoose.model('Trade', TradeSchema);