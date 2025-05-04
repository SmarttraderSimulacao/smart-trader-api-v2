class CandleGenerator {
  constructor() {
    this.lastPrice = 10000;
    this.currentFormingCandle = null;
    this.updateInterval = null;
    this.volatilityFactor = 0.002; // Fator de volatilidade padrão (± 0.1%)
    this.trendBias = 0; // Viés de tendência (-1 a 1, 0 = neutro)
    this.trendDuration = 0; // Duração da tendência atual
    this.maxTrendDuration = 100; // Duração máxima da tendência
  }
  
  // Inicializar com um preço inicial
  initialize(initialPrice = 10000) {
    this.lastPrice = initialPrice;
    this.resetTrend();
    this.startNewCandle(1); // Definir explicitamente como timeframe 1
  }
  
  // Resetar tendência para gerar movimento mais realista
  resetTrend() {
    // Gerar nova tendência com volatilidade mais baixa
    this.trendBias = (Math.random() * 2 - 1) * 0.1; // Reduzido de 0.5 para 0.1
    this.trendDuration = 0;
    this.maxTrendDuration = Math.floor(Math.random() * 80) + 40; // 40 a 120 ticks
    
    // Reduzir volatilidade significativamente
    this.volatilityFactor = 0.0001 + Math.random() * 0.0004; // Reduzido em 10x
    
    console.log(`Nova tendência: bias=${this.trendBias.toFixed(4)}, volatilidade=${this.volatilityFactor.toFixed(6)}, duração máxima=${this.maxTrendDuration}`);
}
  
  // Criar um novo candle - modificado para aceitar timeframe
  startNewCandle(timeframe = 1) {
    const now = Date.now();
    console.log(`Iniciando novo candle com timeframe ${timeframe} no timestamp ${new Date(now).toISOString()}`);
    
    this.currentFormingCandle = {
      timestamp: now,
      open: this.lastPrice,
      high: this.lastPrice,
      low: this.lastPrice,
      close: this.lastPrice,
      volume: 0,
      timeframe: timeframe
    };
  }
  
  // Simular um tick de preço com movimento mais realista
  getNextTick() {
    // Incrementar duração da tendência
    this.trendDuration++;
    
    // Verificar se é hora de mudar a tendência
    if (this.trendDuration >= this.maxTrendDuration) {
      this.resetTrend();
    }
    
    // Calcular componente aleatório
    const randomComponent = (Math.random() - 0.5) * 2 * this.volatilityFactor;
    
    // Calcular componente de tendência
    const trendComponent = this.trendBias * this.volatilityFactor * 0.5;
    
    // Combinar componentes
    const totalChange = this.lastPrice * (randomComponent + trendComponent);
    
    // Calcular novo preço
    const newPrice = Math.max(1, Math.round(this.lastPrice + totalChange));
    
    // Atualizar o candle em formação
    this.currentFormingCandle.close = newPrice;
    this.currentFormingCandle.high = Math.max(this.currentFormingCandle.high, newPrice);
    this.currentFormingCandle.low = Math.min(this.currentFormingCandle.low, newPrice);
    
    // Volume mais realista - maior em movimentos mais fortes
    const volumeFactor = 500 + Math.abs(totalChange) * 50;
    this.currentFormingCandle.volume += Math.floor(Math.random() * volumeFactor);
    
    this.lastPrice = newPrice;
    return newPrice;
  }
  
  // Obter o candle atual em formação
  getCurrentFormingCandle() {
    return {...this.currentFormingCandle};
  }
  
  // Método para finalizar o candle atual e criar um novo
  finalizeCurrentCandle(timeframe = 1) {
    console.log(`Finalizando candle com timeframe ${this.currentFormingCandle.timeframe}`);
    const finalizedCandle = {...this.currentFormingCandle};
    
    // Criar um novo candle com o timeframe especificado
    this.startNewCandle(timeframe);
    
    // Pequena chance de inverter a tendência no início de um novo candle
    if (Math.random() < 0.2) {
      this.trendBias *= -0.8; // Inversão parcial com atenuação
      console.log(`Tendência modificada para ${this.trendBias.toFixed(4)}`);
    }
    
    console.log(`Candle finalizado: open=${finalizedCandle.open}, close=${finalizedCandle.close}, high=${finalizedCandle.high}, low=${finalizedCandle.low}, timestamp=${new Date(finalizedCandle.timestamp).toISOString()}`);
    return finalizedCandle;
  }
  
  // Método para forçar uma tendência específica (útil para testes)
  forceTrend(direction, strength = 0.5, duration = 50) {
    if (direction === 'up') {
      this.trendBias = Math.abs(strength);
    } else if (direction === 'down') {
      this.trendBias = -Math.abs(strength);
    } else {
      this.trendBias = 0; // Neutro
    }
    
    this.trendDuration = 0;
    this.maxTrendDuration = duration;
    console.log(`Tendência forçada: ${direction}, força=${this.trendBias.toFixed(4)}, duração=${duration}`);
  }
}

// Altere apenas esta linha - exporte a classe em vez de uma instância
module.exports = CandleGenerator;