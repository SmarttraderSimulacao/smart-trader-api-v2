const Trade = require('../models/Trade');
const Room = require('../models/Room');
const User = require('../models/User');
const candleGenerator = require('../services/competitionCandleGenerator');

// @desc    Criar uma nova operação
// @route   POST /api/trades
// @access  Private
exports.createTrade = async (req, res) => {
  try {
    const { roomId, type, size = 1 } = req.body;

    // Verificar se a sala existe
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }

    // Verificar se a sala está ativa
   if (room.status !== 'ACTIVE') {
  return res.status(400).json({
    success: false,
    message: 'Esta sala não está ativa. Operações só são permitidas em salas ativas.'
  });
}

    // Verificar se o usuário está inscrito na sala
    let participant = room.participants.find(
      p => p.userId.toString() === req.user.id
    );

    // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
    if (!participant) {
      console.log(`Usuário ${req.user.id} não está inscrito na sala. Inscrevendo automaticamente...`);
      
      participant = {
        userId: req.user.id,
        username: req.user.username,
        initialCapital: 100000,
        currentCapital: 100000,
        openPositions: [],
        joinedAt: Date.now()
      };
      
      room.participants.push(participant);
      await room.save();
      
      console.log(`Usuário ${req.user.username} inscrito automaticamente na sala ${room.name}`);
    }

    // Obter preço atual
    const currentPrice = candleGenerator.lastPrice;
    
    // Criar a operação
    const trade = await Trade.create({
      userId: req.user.id,
      roomId,
      type,
      entryPrice: currentPrice,
      size,
      entryCandle: {
        timestamp: Date.now(),
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice
      }
    });

    // Adicionar posição ao participante
    participant.openPositions.push({
      type,
      entryPrice: currentPrice,
      size,
      timestamp: Date.now()
    });

    await room.save();

    res.status(201).json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Erro ao criar operação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar operação',
      error: error.message
    });
  }
};

// @desc    Obter operações ativas do usuário por sala
// @route   GET /api/trades/active
// @access  Private
exports.getActiveTradesByRoom = async (req, res) => {
  try {
    const { roomId } = req.query;
    
    console.log(`[LOG] Buscando operações ativas para usuário ${req.user.id} na sala ${roomId}`);
    
    if (!roomId) {
      console.log('[ERROR] RoomId não fornecido na requisição');
      return res.status(400).json({
        success: false,
        message: 'O parâmetro roomId é obrigatório'
      });
    }
    
    // Buscar operações ativas do usuário na sala específica
    const activeTrades = await Trade.find({ 
      userId: req.user.id,
      roomId: roomId,
      status: 'OPEN'
    });
    
    console.log(`[LOG] Encontradas ${activeTrades.length} operações ativas`);
    if (activeTrades.length > 0) {
      console.log(`[LOG] Detalhes da primeira operação: ${JSON.stringify(activeTrades[0])}`);
    }

    // Buscar também informações da posição do usuário na sala
    const room = await Room.findById(roomId);
    let userPosition = null;
    
    if (room) {
      let participant = room.participants.find(
        p => p.userId.toString() === req.user.id
      );
      
      // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
      if (!participant) {
        console.log(`[LOG] Usuário ${req.user.id} não está inscrito na sala. Inscrevendo automaticamente...`);
        
        participant = {
          userId: req.user.id,
          username: req.user.username,
          initialCapital: 100000,
          currentCapital: 100000,
          openPositions: [],
          joinedAt: Date.now()
        };
        
        room.participants.push(participant);
        await room.save();
        
        console.log(`[LOG] Usuário ${req.user.username} inscrito automaticamente na sala ${room.name}`);
      }
      
      if (participant) {
        userPosition = {
          currentCapital: participant.currentCapital,
          openPositions: participant.openPositions
        };
      }
    }
    
    res.status(200).json({
      success: true,
      count: activeTrades.length,
      data: {
        trades: activeTrades,
        userPosition
      }
    });
  } catch (error) {
    console.error('Erro ao buscar operações ativas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar operações ativas',
      error: error.message
    });
  }
};

// @desc    Fechar uma operação
// @route   PUT /api/trades/:id/close
// @access  Private
exports.closeTrade = async (req, res) => {
  try {
    const trade = await Trade.findById(req.params.id);

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: 'Operação não encontrada'
      });
    }

    // Verificar se o usuário é dono da operação
    if (trade.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    // Verificar se a operação já está fechada
    if (trade.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Esta operação já está fechada'
      });
    }

    // Obter preço atual
    const currentPrice = candleGenerator.lastPrice;
    
    // Calcular lucro/prejuízo
    let profit = 0;
    if (trade.type === 'LONG') {
      profit = (currentPrice - trade.entryPrice) * trade.size;
    } else {
      profit = (trade.entryPrice - currentPrice) * trade.size;
    }

    // Atualizar operação
    trade.exitPrice = currentPrice;
    trade.profit = profit;
    trade.status = 'CLOSED';
    trade.exitTime = Date.now();
    trade.closedBy = 'USER';
    trade.exitCandle = {
      timestamp: Date.now(),
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice
    };

    await trade.save();

    // Atualizar posição do participante
    const room = await Room.findById(trade.roomId);
    let participant = room.participants.find(
      p => p.userId.toString() === req.user.id
    );

    // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
    if (!participant) {
      console.log(`[LOG] Usuário ${req.user.id} não está inscrito na sala. Inscrevendo automaticamente ao fechar operação...`);
      
      participant = {
        userId: req.user.id,
        username: req.user.username,
        initialCapital: 100000,
        currentCapital: 100000,
        openPositions: [],
        joinedAt: Date.now()
      };
      
      room.participants.push(participant);
      console.log(`[LOG] Usuário ${req.user.username} inscrito automaticamente na sala ${room.name}`);
    }

    // Remover posição da lista de posições abertas
    const positionIndex = participant.openPositions.findIndex(
      p => p.timestamp.toString() === trade.entryTime.toString()
    );

    if (positionIndex !== -1) {
      participant.openPositions.splice(positionIndex, 1);
    }

    // Atualizar capital
    participant.currentCapital += profit;
    await room.save();

    res.status(200).json({
      success: true,
      data: {
        trade,
        currentCapital: participant.currentCapital
      }
    });
  } catch (error) {
    console.error('Erro ao fechar operação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fechar operação',
      error: error.message
    });
  }
};

// @desc    Configurar Stop Loss
// @route   PUT /api/trades/:id/stoploss
// @access  Private
exports.setStopLoss = async (req, res) => {
  try {
    const { stopLoss } = req.body;

    const trade = await Trade.findById(req.params.id);

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: 'Operação não encontrada'
      });
    }

    // Verificar se o usuário é dono da operação
    if (trade.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    // Verificar se a operação está aberta
    if (trade.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Esta operação não está aberta'
      });
    }

    // Atualizar Stop Loss
    trade.stopLoss = stopLoss;
    await trade.save();

    // Atualizar posição do participante
    const room = await Room.findById(trade.roomId);
    let participant = room.participants.find(
      p => p.userId.toString() === req.user.id
    );

    // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
    if (!participant) {
      console.log(`[LOG] Usuário ${req.user.id} não está inscrito na sala. Inscrevendo automaticamente ao configurar SL...`);
      
      participant = {
        userId: req.user.id,
        username: req.user.username,
        initialCapital: 100000,
        currentCapital: 100000,
        openPositions: [],
        joinedAt: Date.now()
      };
      
      room.participants.push(participant);
      console.log(`[LOG] Usuário ${req.user.username} inscrito automaticamente na sala ${room.name}`);
    }

    // Atualizar Stop Loss da posição
    const position = participant.openPositions.find(
      p => p.timestamp.toString() === trade.entryTime.toString()
    );

    if (position) {
      position.stopLoss = stopLoss;
      await room.save();
    }

    res.status(200).json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Erro ao configurar Stop Loss:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao configurar Stop Loss',
      error: error.message
    });
  }
};

// @desc    Configurar Take Profit
// @route   PUT /api/trades/:id/takeprofit
// @access  Private
exports.setTakeProfit = async (req, res) => {
  try {
    const { takeProfit } = req.body;

    const trade = await Trade.findById(req.params.id);

    if (!trade) {
      return res.status(404).json({
        success: false,
        message: 'Operação não encontrada'
      });
    }

    // Verificar se o usuário é dono da operação
    if (trade.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    // Verificar se a operação está aberta
    if (trade.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        message: 'Esta operação não está aberta'
      });
    }

    // Atualizar Take Profit
    trade.takeProfit = takeProfit;
    await trade.save();

    // Atualizar posição do participante
    const room = await Room.findById(trade.roomId);
    let participant = room.participants.find(
      p => p.userId.toString() === req.user.id
    );

    // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
    if (!participant) {
      console.log(`[LOG] Usuário ${req.user.id} não está inscrito na sala. Inscrevendo automaticamente ao configurar TP...`);
      
      participant = {
        userId: req.user.id,
        username: req.user.username,
        initialCapital: 100000,
        currentCapital: 100000,
        openPositions: [],
        joinedAt: Date.now()
      };
      
      room.participants.push(participant);
      console.log(`[LOG] Usuário ${req.user.username} inscrito automaticamente na sala ${room.name}`);
    }

    // Atualizar Take Profit da posição
    const position = participant.openPositions.find(
      p => p.timestamp.toString() === trade.entryTime.toString()
    );

    if (position) {
      position.takeProfit = takeProfit;
      await room.save();
    }

    res.status(200).json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Erro ao configurar Take Profit:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao configurar Take Profit',
      error: error.message
    });
  }
};

// @desc    Obter operações do usuário
// @route   GET /api/trades
// @access  Private
exports.getUserTrades = async (req, res) => {
  try {
    const { roomId, status } = req.query;
    
    let query = { userId: req.user.id };
    
    if (roomId) {
      query.roomId = roomId;
    }
    
    if (status) {
      query.status = status;
    }
    
    const trades = await Trade.find(query).sort({ entryTime: -1 });
    
    res.status(200).json({
      success: true,
      count: trades.length,
      data: trades
    });
  } catch (error) {
    console.error('Erro ao buscar operações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar operações',
      error: error.message
    });
  }
};

// Método interno para uso pelos serviços
exports.createTradeInternal = async (userId, roomId, type, size, currentPrice) => {
  console.log(`[LOG] Criando trade interno: userId=${userId}, roomId=${roomId}, type=${type}, price=${currentPrice}`);

  try {
    // Verificar se a sala existe
    const room = await Room.findById(roomId);
    if (!room) {
      throw new Error('Sala não encontrada');
    }

    // Verificar se a sala está ativa
    if (room.status !== 'ACTIVE') {
  throw new Error('Esta sala não está ativa. Operações só são permitidas em salas ativas.');
}

    // Verificar se o usuário está inscrito na sala
    let participant = room.participants.find(
      p => p.userId.toString() === userId.toString()
    );

    // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
    if (!participant) {
      console.log(`[LOG] Usuário ${userId} não está inscrito na sala ${room.name}. Inscrevendo automaticamente...`);
      
      // Buscar informações do usuário
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('Usuário não encontrado');
      }
      
      // Adicionar usuário como participante
      participant = {
        userId: userId,
        username: user.username,
        initialCapital: 100000,
        currentCapital: 100000,
        openPositions: [],
        joinedAt: Date.now()
      };
      
      room.participants.push(participant);
      await room.save();
      
      // Atualizar a referência do participante
      participant = room.participants[room.participants.length - 1];
      console.log(`[LOG] Usuário ${user.username} inscrito automaticamente na sala ${room.name}`);
    }
    
    // Se for uma ordem de fechamento
    if (type === 'CLOSE') {
      console.log(`[LOG] Processando ordem de fechamento para usuário ${userId} na sala ${roomId}`);
      
      // Buscar operações abertas do usuário
      const openTrades = await Trade.find({
        userId,
        roomId,
        status: 'OPEN'
      });
      
      if (openTrades.length > 0) {
        console.log(`[LOG] Encontradas ${openTrades.length} operações abertas para fechar`);
        let totalProfit = 0;
        
        // Fechar todas as operações abertas
        for (const trade of openTrades) {
          // Calcular lucro/prejuízo
          let profit = 0;
          if (trade.type === 'LONG') {
            profit = (currentPrice - trade.entryPrice) * trade.size;
          } else {
            profit = (trade.entryPrice - currentPrice) * trade.size;
          }
          
          console.log(`[LOG] Calculado lucro/prejuízo para operação ${trade._id}: ${profit}`);
          
          // Atualizar operação
          trade.exitPrice = currentPrice;
          trade.profit = profit;
          trade.status = 'CLOSED';
          trade.exitTime = Date.now();
          trade.closedBy = 'USER';
          trade.exitCandle = {
            timestamp: Date.now(),
            open: currentPrice,
            high: currentPrice,
            low: currentPrice,
            close: currentPrice
          };
          
          await trade.save();
          totalProfit += profit;
        }
        
        // Atualizar capital do participante
        participant.currentCapital += totalProfit;
        console.log(`[LOG] Capital do participante atualizado: ${participant.currentCapital} (${totalProfit > 0 ? '+' : ''}${totalProfit})`);
        
        // Limpar posições abertas
        participant.openPositions = [];
        
        // Salvar alterações
        await room.save();
        
        return { 
          message: `Fechadas ${openTrades.length} operações com ${totalProfit >= 0 ? 'lucro' : 'prejuízo'} de ${Math.abs(totalProfit)}`,
          profit: totalProfit,
          currentCapital: participant.currentCapital
        };
      } else {
        console.log(`[LOG] Nenhuma operação aberta para fechar para o usuário ${userId}`);
        return { message: 'Nenhuma operação aberta para fechar' };
      }
    }
    
    // Se for uma nova operação (LONG ou SHORT)
    const trade = await Trade.create({
      userId,
      roomId,
      type,
      entryPrice: currentPrice,
      size,
      entryTime: Date.now(),
      status: 'OPEN',
      entryCandle: {
        timestamp: Date.now(),
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice
      }
    });

    // Adicionar posição ao participante
    participant.openPositions.push({
      type,
      entryPrice: currentPrice,
      size,
      timestamp: Date.now()
    });

    await room.save();
    
    console.log(`[LOG] Trade criado com sucesso: ${JSON.stringify(trade)}`);

    return trade;
  } catch (error) {
    console.error(`[ERROR] Erro ao criar trade interno: ${error.message}`);
    throw error;
  }
};

// Método para verificar e executar Stop Loss e Take Profit
exports.checkStopLossAndTakeProfit = async (currentPrice) => {
  try {
    // Buscar todas as operações abertas
    const openTrades = await Trade.find({ status: 'OPEN' });
    
    for (const trade of openTrades) {
      const triggerType = trade.checkStopLossAndTakeProfit(currentPrice);
      
      if (triggerType) {
        // Calcular lucro/prejuízo
        let profit = 0;
        if (trade.type === 'LONG') {
          profit = (currentPrice - trade.entryPrice) * trade.size;
        } else {
          profit = (trade.entryPrice - currentPrice) * trade.size;
        }
        
        // Atualizar operação
        trade.exitPrice = currentPrice;
        trade.profit = profit;
        trade.status = 'CLOSED';
        trade.exitTime = Date.now();
        trade.closedBy = triggerType;
        trade.exitCandle = {
          timestamp: Date.now(),
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice
        };
        
        await trade.save();
        
        // Atualizar posição do participante
        const room = await Room.findById(trade.roomId);
        const participant = room.participants.find(
          p => p.userId.toString() === trade.userId.toString()
        );
        
        // Verificar se participante foi encontrado
        if (participant) {
          // Remover posição da lista de posições abertas
          const positionIndex = participant.openPositions.findIndex(
            p => p.timestamp.toString() === trade.entryTime.toString()
          );
          
          if (positionIndex !== -1) {
            participant.openPositions.splice(positionIndex, 1);
          }
          
          // Atualizar capital
          participant.currentCapital += profit;
          await room.save();
          
          console.log(`Operação ${trade._id} fechada por ${triggerType} com ${profit > 0 ? 'lucro' : 'prejuízo'} de ${profit}`);
        } else {
          console.log(`Participante não encontrado para usuário ${trade.userId} na sala ${trade.roomId}`);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar Stop Loss e Take Profit:', error);
  }
};