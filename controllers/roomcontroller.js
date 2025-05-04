const Room = require('../models/Room');
const User = require('../models/User');
const Trade = require('../models/Trade');

// @desc    Obter todas as salas disponíveis
// @route   GET /api/rooms
// @access  Public
exports.getAllRooms = async (req, res) => {
  try {
    console.log('Request query:', req.query);
    const { status, date } = req.query;
    
    // Iniciar a consulta filtrando apenas PENDING e ACTIVE
    let query = { status: { $in: ['PENDING', 'ACTIVE'] } };
    
    // Se um status específico foi solicitado e está entre os permitidos, usar esse
    if (status && ['PENDING', 'ACTIVE'].includes(status)) {
      query.status = status;
    }
    
    console.log('Date parameter:', date);
    
    // Primeiro tentamos buscar salas para a data solicitada
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      console.log('Filtering rooms between:', startDate, 'and', endDate);
      
      query.competitionDate = {
        $gte: startDate,
        $lte: endDate
      };
    } else {
      // Se nenhuma data for fornecida, usa a data atual
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      console.log('No date provided, using today:', today);
      
      query.competitionDate = {
        $gte: today,
        $lt: tomorrow
      };
    }
    
    console.log('Initial query:', JSON.stringify(query));
    
    let rooms = await Room.find(query)
      .select('name entryFee capacity participants competitionDate startTime endTime status totalPrizePool')
      .sort({ competitionDate: 1 });
      
    console.log('Found rooms for date:', rooms.length);
    
    // Se não encontrou salas para a data solicitada, buscar salas PENDING mais próximas
    if (rooms.length === 0) {
      console.log('No rooms found for specified date, looking for upcoming PENDING rooms...');
      
      // Remove o filtro de data
      delete query.competitionDate;
      
      // Mantém apenas salas PENDING ou ACTIVE (já definidas na query)
      
      // Busca as próximas 10 salas, ordenadas pela data mais próxima
      rooms = await Room.find(query)
        .select('name entryFee capacity participants competitionDate startTime endTime status totalPrizePool')
        .sort({ competitionDate: 1 })
        .limit(10);
        
      console.log('Found upcoming rooms:', rooms.length);
    }
    
    // Se ainda não encontrou salas, retornar array vazio em vez de criar uma sala automática
if (rooms.length === 0) {
  console.log('No rooms found at all, returning empty array');
  
  // Não criar sala automática
  // O front-end deve mostrar uma mensagem de "Nenhuma sala disponível"
  
  return res.status(200).json({
    success: true,
    count: 0,
    data: []
  });
}
    
    // Processar os dados das salas
    const roomsWithCounts = rooms.map(room => {
      const participantCount = room.participants.length;
      
      let prizePool = room.totalPrizePool;
      if (room.entryFee > 0 && participantCount > 0) {
        // Corrigir para usar 80% em vez de 50%
        prizePool = Math.floor(room.entryFee * participantCount * 0.8);
      }
      
      return {
        _id: room._id,
        name: room.name,
        entryFee: room.entryFee,
        capacity: room.capacity,
        participantCount,
        availableSpots: room.capacity - participantCount,
        competitionDate: room.competitionDate,
        startTime: room.startTime,
        endTime: room.endTime,
        status: room.status,
        totalPrizePool: prizePool
      };
    });
    
    res.status(200).json({
      success: true,
      count: roomsWithCounts.length,
      data: roomsWithCounts
    });
  } catch (error) {
    console.error('Erro ao buscar salas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar salas',
      error: error.message
    });
  }
};

// @desc    Obter uma sala específica
// @route   GET /api/rooms/:id
// @access  Public
exports.getRoomDetails = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }
    
    // Obter ranking atual
    const ranking = room.getCurrentRanking();
    
    // Calcular prêmio com base no número real de participantes (se for sala paga)
    let prizePool = room.totalPrizePool;
    if (room.entryFee > 0 && room.participants.length > 0) {
      prizePool = Math.floor(room.entryFee * room.participants.length * 0.8);
    }
    
    // Verificar se ranking possui a propriedade 'ranking' e se é um array
    let topRanking = [];
    if (ranking && ranking.ranking && Array.isArray(ranking.ranking)) {
      topRanking = ranking.ranking.slice(0, 10); // Top 10 para exibição
    } else if (ranking && Array.isArray(ranking)) {
      topRanking = ranking.slice(0, 10); // Caso ranking seja diretamente um array
    } else {
      console.log('Aviso: formato de ranking inesperado:', JSON.stringify(ranking));
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: room._id,
        name: room.name,
        entryFee: room.entryFee,
        capacity: room.capacity,
        participantCount: room.participants.length,
        availableSpots: room.capacity - room.participants.length,
        competitionDate: room.competitionDate,
        startTime: room.startTime,
        endTime: room.endTime,
        status: room.status,
        totalPrizePool: prizePool,
        prizeDistribution: room.prizeDistribution,
        ranking: topRanking // Usa o ranking já tratado
      }
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes da sala:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar detalhes da sala',
      error: error.message
    });
  }
};
// @desc    Entrar em uma sala (inscrever-se)
// @route   POST /api/rooms/:id/join
// @access  Private
exports.joinRoom = async (req, res) => {
  console.log('Join room request received for room ID:', req.params.id);
  console.log('User making request:', req.user ? req.user.id : 'No user found');
  
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      console.log('Room not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }
    console.log('Room found:', room.name);
    
    // Verificar se o usuário já está inscrito
    const alreadyJoined = room.participants.some(
      participant => participant.userId.toString() === req.user.id
    );
    
    if (alreadyJoined) {
      console.log('User already joined this room');
      return res.status(400).json({
        success: false,
        message: 'Você já está inscrito nesta sala'
      });
    }
    
    // Verificar se a sala está cheia
    if (room.isFull()) {
      console.log('Room is full');
      return res.status(400).json({
        success: false,
        message: 'Sala cheia'
      });
    }
    
    // Verificar se a sala ainda aceita inscrições
    // NOTA: Modificado para aceitar inscrições em salas ACTIVE também para facilitar testes
    if (room.status !== 'PENDING' && room.status !== 'ACTIVE') {
      console.log('Room status is not PENDING or ACTIVE, current status:', room.status);
      return res.status(400).json({
        success: false,
        message: 'Esta sala não aceita mais inscrições'
      });
    }
    
    // Verificar se o usuário tem saldo suficiente
    const user = await User.findById(req.user.id);
    console.log('User balance:', user.balance, 'Room entry fee:', room.entryFee);
    
    if (user.balance < room.entryFee) {
      console.log('Insufficient balance');
      return res.status(400).json({
        success: false,
        message: 'Saldo insuficiente'
      });
    }
    
    // Debitar do saldo do usuário
    user.balance -= room.entryFee;
    console.log('Deducted entry fee, new balance:', user.balance);
    
    // Registrar pagamento
    user.paymentHistory.push({
      amount: -room.entryFee,
      type: 'entry_fee',
      description: `Inscrição na sala ${room.name}`,
      roomId: room._id
    });
    
    console.log('Saving user with updated balance');
    await user.save();
    
    // Adicionar usuário à sala
    console.log('Adding user to room participants');
    room.participants.push({
      userId: req.user.id,
      username: user.username,
      initialCapital: 100000,
      currentCapital: 100000,
      openPositions: []
    });
    
    // Recalcular prêmio total com base no número atual de participantes
    if (room.entryFee > 0) {
      const newPrizePool = Math.floor(room.entryFee * room.participants.length * 0.8);
      console.log('Recalculating prize pool, new value:', newPrizePool);
      room.totalPrizePool = newPrizePool;
    }
    
    console.log('Saving room with updated participants');
    await room.save();
    
    console.log('Join room successful');
    res.status(200).json({
      success: true,
      message: 'Inscrição realizada com sucesso',
      data: {
        roomId: room._id,
        initialCapital: 100000,
        roomName: room.name,
        competitionDate: room.competitionDate,
        startTime: room.startTime,
        endTime: room.endTime
      }
    });
  } catch (error) {
    console.error('Detailed error joining room:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Erro ao entrar na sala',
      error: error.message
    });
  }
};

// @desc    Criar nova sala (admin)
// @route   POST /api/rooms
// @access  Private/Admin
exports.createRoom = async (req, res) => {
  try {
    const { name, entryFee, capacity, competitionDate, startTime, endTime, prizeDistribution } = req.body;
    
    // Criar sala
    const room = await Room.create({
      name,
      entryFee,
      capacity: capacity || 25,
      competitionDate,
      startTime: startTime || '00:00', 
      endTime: endTime || '23:59',
      status: 'PENDING', // Corrigir para PENDING em vez de ACTIVE
      prizeDistribution: prizeDistribution || undefined,
      // Definir o prêmio inicial
      // Para salas gratuitas, o prêmio é fixo
      totalPrizePool: entryFee === 0 ? 30 : 0 // Prêmio inicial para salas pagas será calculado dinamicamente
    });
    
    res.status(201).json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('Erro ao criar sala:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar sala',
      error: error.message
    });
  }
};

// @desc    Atualizar status da sala (admin)
// @route   PUT /api/rooms/:id/status
// @access  Private/Admin
exports.updateRoomStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['PENDING', 'ACTIVE', 'CLOSED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status inválido'
      });
    }
    
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }
    
    // Se estiver fechando a sala, calcular vencedores
    if (status === 'CLOSED' && room.status !== 'CLOSED') {
      // Recalcular prêmio total com base no número final de participantes
      if (room.entryFee > 0) {
        room.totalPrizePool = Math.floor(room.entryFee * room.participants.length * 0.8);
      }
      
      await calculateWinners(room);
    }
    
    room.status = status;
    await room.save();
    
    res.status(200).json({
      success: true,
      data: room
    });
  } catch (error) {
    console.error('Erro ao atualizar status da sala:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status da sala',
      error: error.message
    });
  }
};

// Função para calcular vencedores quando a sala for fechada
async function calculateWinners(room) {
  // Recalcular prêmio total com base no número final de participantes
  if (room.entryFee > 0) {
    room.totalPrizePool = Math.floor(room.entryFee * room.participants.length * 0.8);
  }
  
  // Obter ranking final
  const ranking = room.getCurrentRanking();
  
  // Fechar todas as posições abertas
  for (const participant of room.participants) {
    if (participant.openPositions.length > 0) {
      // Aqui deveria ter a lógica para fechar as posições
      // Mas isso é feito no tradeController ao encerrar a competição
    }
  }
  
  // Definir vencedores com base no ranking
  const winners = [];
  
  // Calcular prêmios para os 7 primeiros de acordo com a distribuição
  for (let i = 0; i < Math.min(7, ranking.length); i++) {
    const position = i + 1;
    const distribution = room.prizeDistribution.find(d => d.position === position);
    const percentage = distribution ? distribution.percentage : 0;
    const prize = Math.floor(room.totalPrizePool * (percentage / 100));
    
    winners.push({
      position,
      userId: ranking[i].userId,
      username: ranking[i].username,
      finalCapital: ranking[i].capital,
      prize,
      paid: false
    });
  }
  
  room.winners = winners;
}