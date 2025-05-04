const Candle = require('../models/Candle');
exports.getCandles = async (req, res) => {
  try {
    const { timeframe, limit } = req.query;
    const timeframeNumber = parseInt(timeframe);
    const limitNumber = parseInt(limit) || 200; // Define um limite padrão
    if (!timeframeNumber) {
      return res.status(400).json({ message: 'O parâmetro timeframe é obrigatório.' });
    }
    if (timeframeNumber === 1) {
      // Buscar diretamente os candles de 1 minuto
      const candles = await Candle.find({ timeframe: 1 })
        .sort({ timestamp: -1 })
        .limit(limitNumber);
      return res.status(200).json(candles);
    } else {
      // Lógica para agregar candles de 1 minuto
      const aggregationMultiplier = timeframeNumber / 1; // Assumindo que os dados base são de 1 minuto
      if (!Number.isInteger(aggregationMultiplier) || aggregationMultiplier < 1) {
        return res.status(400).json({ message: 'Timeframe inválido para agregação.' });
      }
      // Buscar os candles de 1 minuto necessários para a agregação
      const numberOfBaseCandles = limitNumber * aggregationMultiplier;
      const baseCandles = await Candle.find({ timeframe: 1 })
        .sort({ timestamp: -1 })
        .limit(numberOfBaseCandles);
      if (!baseCandles || baseCandles.length === 0) {
        return res.status(200).json([]); // Retorna um array vazio se não houver dados base
      }
      const aggregatedCandles = [];
      for (let i = 0; i < baseCandles.length; i += aggregationMultiplier) {
        const batch = baseCandles.slice(i, i + aggregationMultiplier);
        if (batch.length === aggregationMultiplier) {
          const open = batch[batch.length - 1].open; // O 'open' do candle agregado é o 'open' do primeiro candle do batch (ordenado desc)
          const close = batch[0].close;           // O 'close' é o 'close' do último candle do batch (ordenado desc)
          let high = -Infinity;
          let low = Infinity;
          let volume = 0;
          let firstTimestamp = batch[batch.length - 1].timestamp;
          let lastTimestamp = batch[0].timestamp;
          batch.forEach(candle => {
            high = Math.max(high, candle.high);
            low = Math.min(low, candle.low);
            volume += candle.volume;
          });
          aggregatedCandles.push({
            timestamp: firstTimestamp, // Usando o timestamp do início do período agregado
            open: open,
            high: high,
            low: low,
            close: close,
            volume: volume,
            timeframe: timeframeNumber
          });
        }
      }
      // Inverter a ordem para que os candles mais antigos venham primeiro (como geralmente esperado)
      res.status(200).json(aggregatedCandles.reverse().slice(0, limitNumber));
    }
  } catch (error) {
    console.error('Erro ao buscar e/ou agregar candles históricos:', error);
    res.status(500).json({ message: 'Erro ao buscar e/ou agregar candles históricos.', error: error.message });
  }
};

exports.getCurrentCandle = async (req, res) => {
  // Sua lógica para buscar o candle atual aqui (se necessário uma rota separada via HTTP)
  // Com base no seu código anterior, o candle atual está sendo enviado via WebSocket.
  res.status(404).json({ message: 'Rota para candle atual não implementada via HTTP.' });
};

exports.getCandlesByRange = async (req, res) => {
  try {
    const { startTime, endTime, timeframe } = req.query;
    
    if (!startTime || !endTime) {
      return res.status(400).json({ message: 'Os parâmetros startTime e endTime são obrigatórios' });
    }
    
    const startTimestamp = parseInt(startTime);
    const endTimestamp = parseInt(endTime);
    const timeframeValue = parseInt(timeframe) || 1;
    
    // Buscar candles no intervalo solicitado
    const candles = await Candle.find({
      timestamp: { $gte: startTimestamp, $lte: endTimestamp },
      timeframe: timeframeValue
    }).sort({ timestamp: 1 });
    
    res.status(200).json(candles);
  } catch (error) {
    console.error('Erro ao buscar candles por intervalo:', error);
    res.status(500).json({ message: 'Erro ao buscar candles por intervalo', error: error.message });
  }
};