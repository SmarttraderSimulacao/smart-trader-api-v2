const User = require('../models/User');
const Room = require('../models/Room');
const Trade = require('../models/Trade');

/**
 * @desc    Listar todos os usuários
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    // Parâmetros de paginação e filtros
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const startIndex = (page - 1) * limit;
    
    // Filtro de verificação de documento
    const verificationStatus = req.query.verification;
    let filter = {};
    
    if (verificationStatus === 'pending') {
      filter.documentVerified = false;
      filter.documentUrl = { $ne: null }; // Possui documento mas não verificado
    } else if (verificationStatus === 'verified') {
      filter.documentVerified = true;
    } else if (verificationStatus === 'all') {
      // Sem filtro adicional
    }
    
    // Buscar usuários
    const users = await User.find(filter)
      .select('username email balance documentUrl documentVerified createdAt')
      .skip(startIndex)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    // Contar total de documentos
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      count: users.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: users
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar usuários',
      error: error.message
    });
  }
};

/**
 * @desc    Obter detalhes de um usuário
 * @route   GET /api/admin/users/:id
 * @access  Private/Admin
 */
exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes do usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar detalhes do usuário',
      error: error.message
    });
  }
};

/**
 * @desc    Verificar documento de um usuário
 * @route   PUT /api/admin/users/:id/verify-document
 * @access  Private/Admin
 */
exports.verifyUserDocument = async (req, res) => {
  try {
    const { verified } = req.body;
    
    // Verificar se o parâmetro foi fornecido
    if (verified === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetro "verified" é obrigatório'
      });
    }
    
    // Atualizar status de verificação
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { documentVerified: verified },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Registrar ação para auditoria
    console.log(`Documento do usuário ${user.username} ${verified ? 'verificado' : 'rejeitado'} por ${req.user.username}`);
    
    res.status(200).json({
      success: true,
      message: `Documento ${verified ? 'verificado' : 'rejeitado'} com sucesso`,
      data: {
        _id: user._id,
        username: user.username,
        documentVerified: user.documentVerified
      }
    });
  } catch (error) {
    console.error('Erro ao verificar documento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar documento',
      error: error.message
    });
  }
};

/**
 * @desc    Adicionar saldo a um usuário
 * @route   PUT /api/admin/users/:id/add-balance
 * @access  Private/Admin
 */
exports.addUserBalance = async (req, res) => {
  try {
    const { amount, description } = req.body;
    
    // Validar parâmetros
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valor inválido'
      });
    }
    
    // Buscar usuário
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Adicionar ao saldo
    user.balance += parseFloat(amount);
    
    // Registrar no histórico de pagamentos
    user.paymentHistory.push({
      amount: parseFloat(amount),
      type: 'admin_credit',
      description: description || 'Crédito adicionado pelo administrador',
      adminId: req.user._id
    });
    
    await user.save();
    
    // Registrar ação para auditoria
    console.log(`Saldo de ${amount} adicionado ao usuário ${user.username} por ${req.user.username}`);
    
    res.status(200).json({
      success: true,
      message: 'Saldo adicionado com sucesso',
      data: {
        _id: user._id,
        username: user.username,
        balance: user.balance
      }
    });
  } catch (error) {
    console.error('Erro ao adicionar saldo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao adicionar saldo',
      error: error.message
    });
  }
};

/**
 * @desc    Listar salas de competição
 * @route   GET /api/admin/rooms
 * @access  Private/Admin
 */
exports.getAllRooms = async (req, res) => {
  try {
    // Parâmetros de paginação e filtros
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const startIndex = (page - 1) * limit;
    
    // Filtro de status
    const status = req.query.status;
    let filter = {};
    
    if (status && ['PENDING', 'ACTIVE', 'CLOSED'].includes(status)) {
      filter.status = status;
    }
    
    // Buscar salas
    const rooms = await Room.find(filter)
      .select('name entryFee capacity participants competitionDate startTime endTime status totalPrizePool')
      .skip(startIndex)
      .limit(limit)
      .sort({ competitionDate: -1 });
    
    // Contar total de documentos
    const total = await Room.countDocuments(filter);
    
    // Processar os dados das salas
    const roomsWithCounts = rooms.map(room => {
      const participantCount = room.participants.length;
      
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
        totalPrizePool: room.totalPrizePool
      };
    });
    
    res.status(200).json({
      success: true,
      count: roomsWithCounts.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: roomsWithCounts
    });
  } catch (error) {
    console.error('Erro ao listar salas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar salas',
      error: error.message
    });
  }
};

/**
 * @desc    Obter detalhes de uma sala
 * @route   GET /api/admin/rooms/:id
 * @access  Private/Admin
 */
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
      prizePool = Math.floor(room.entryFee * room.participants.length * 0.5);
    }
    
    res.status(200).json({
      success: true,
      data: {
        _id: room._id,
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
        ranking: ranking,
        participants: room.participants
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

/**
 * @desc    Criar nova sala
 * @route   POST /api/admin/rooms
 * @access  Private/Admin
 */
exports.createRoom = async (req, res) => {
  try {
    const { 
      name, 
      entryFee, 
      capacity, 
      competitionDate, 
      startTime, 
      endTime, 
      prizeDistribution,
      status 
    } = req.body;
    
    // Validações básicas
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Nome da sala é obrigatório'
      });
    }
    
    // Criar sala
    const room = await Room.create({
      name,
      entryFee: entryFee || 0,
      capacity: capacity || 25,
      competitionDate: competitionDate || new Date(),
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
      status: status || 'PENDING',
      prizeDistribution: prizeDistribution || [
        { position: 1, percentage: 50 },
        { position: 2, percentage: 30 },
        { position: 3, percentage: 20 }
      ],
      // Definir o prêmio inicial
      totalPrizePool: entryFee === 0 ? 30 : 0 // Prêmio inicial para salas pagas será calculado dinamicamente
    });
    
    // Registrar ação para auditoria
    console.log(`Sala "${room.name}" criada por ${req.user.username}`);
    
    res.status(201).json({
      success: true,
      message: 'Sala criada com sucesso',
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

/**
 * @desc    Atualizar status da sala
 * @route   PUT /api/admin/rooms/:id/status
 * @access  Private/Admin
 */
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
        room.totalPrizePool = Math.floor(room.entryFee * room.participants.length * 0.5);
      }
      
      // Calcular vencedores
      const ranking = room.getCurrentRanking();
      
      // Definir vencedores com base no ranking
      const winners = [];
      
      // Calcular prêmios para os primeiros colocados de acordo com a distribuição
      for (let i = 0; i < Math.min(7, ranking.length); i++) {
        const position = i + 1;
        const distribution = room.prizeDistribution.find(d => d.position === position) || 
                            { position, percentage: 0 };
        const percentage = distribution.percentage;
        const prize = Math.floor(room.totalPrizePool * (percentage / 100));
        
        if (ranking[i]) {
          winners.push({
            position,
            userId: ranking[i].userId,
            username: ranking[i].username,
            finalCapital: ranking[i].capital,
            prize,
            paid: false
          });
        }
      }
      
      room.winners = winners;
    }
    
    // Atualizar status
    room.status = status;
    await room.save();
    
    // Registrar ação para auditoria
    console.log(`Status da sala "${room.name}" alterado para ${status} por ${req.user.username}`);
    
    res.status(200).json({
      success: true,
      message: `Status da sala alterado para ${status}`,
      data: {
        _id: room._id,
        name: room.name,
        status: room.status,
        winners: room.winners || []
      }
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

/**
 * @desc    Processar pagamentos dos vencedores
 * @route   POST /api/admin/rooms/:id/process-payments
 * @access  Private/Admin
 */
exports.processRoomPayments = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }
    
    // Verificar se a sala está fechada
    if (room.status !== 'CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Somente salas fechadas podem ter pagamentos processados'
      });
    }
    
    // Verificar se há vencedores
    if (!room.winners || room.winners.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Não há vencedores para processar pagamentos'
      });
    }
    
    // Processar pagamentos para cada vencedor
    const processedPayments = [];
    
    for (const winner of room.winners) {
      // Pular se já foi pago
      if (winner.paid) continue;
      
      try {
        // Buscar usuário
        const user = await User.findById(winner.userId);
        
        if (user) {
          // Adicionar prêmio ao saldo
          user.balance += winner.prize;
          
          // Registrar no histórico de pagamentos
          user.paymentHistory.push({
            amount: winner.prize,
            type: 'competition_prize',
            description: `Prêmio pela ${winner.position}ª posição na sala "${room.name}"`,
            roomId: room._id
          });
          
          await user.save();
          
          // Marcar como pago na sala
          winner.paid = true;
          
          processedPayments.push({
            userId: winner.userId,
            username: winner.username,
            position: winner.position,
            prize: winner.prize
          });
        }
      } catch (err) {
        console.error(`Erro ao processar pagamento para o usuário ${winner.userId}:`, err);
      }
    }
    
    // Salvar as alterações na sala
    await room.save();
    
    // Registrar ação para auditoria
    console.log(`Pagamentos da sala "${room.name}" processados por ${req.user.username}`);
    
    res.status(200).json({
      success: true,
      message: 'Pagamentos processados com sucesso',
      data: {
        roomId: room._id,
        roomName: room.name,
        processedPayments
      }
    });
  } catch (error) {
    console.error('Erro ao processar pagamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar pagamentos',
      error: error.message
    });
  }
};

/**
 * @desc    Obter relatório de competições
 * @route   GET /api/admin/reports/competitions
 * @access  Private/Admin
 */
exports.getCompetitionsReport = async (req, res) => {
  try {
    // Parâmetros de filtro
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(0);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Ajustar endDate para o final do dia
    endDate.setHours(23, 59, 59, 999);
    
    // Filtrar salas pelo período
    const rooms = await Room.find({
      status: 'CLOSED',
      competitionDate: {
        $gte: startDate,
        $lte: endDate
      }
    }).select('name entryFee participants winners competitionDate totalPrizePool');
    
    // Calcular estatísticas
    const totalCompetitions = rooms.length;
    let totalParticipants = 0;
    let totalEntryFees = 0;
    let totalPrizes = 0;
    
    const competitionsData = rooms.map(room => {
      const participantCount = room.participants.length;
      totalParticipants += participantCount;
      
      const entryFeesTotal = room.entryFee * participantCount;
      totalEntryFees += entryFeesTotal;
      
      let prizesTotal = 0;
      if (room.winners && room.winners.length > 0) {
        prizesTotal = room.winners.reduce((sum, winner) => sum + winner.prize, 0);
      }
      totalPrizes += prizesTotal;
      
      return {
        _id: room._id,
        name: room.name,
        competitionDate: room.competitionDate,
        participantCount,
        entryFee: room.entryFee,
        entryFeesTotal,
        prizesTotal,
        profit: entryFeesTotal - prizesTotal
      };
    });
    
    res.status(200).json({
      success: true,
      data: {
        startDate,
        endDate,
        summary: {
          totalCompetitions,
          totalParticipants,
          totalEntryFees,
          totalPrizes,
          totalProfit: totalEntryFees - totalPrizes
        },
        competitions: competitionsData
      }
    });
  } catch (error) {
    console.error('Erro ao gerar relatório de competições:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar relatório de competições',
      error: error.message
    });
  }
};

/**
 * @desc    Obter estatísticas gerais
 * @route   GET /api/admin/stats
 * @access  Private/Admin
 */
exports.getAdminStats = async (req, res) => {
  try {
    // Totais
    const totalUsers = await User.countDocuments();
    const pendingDocuments = await User.countDocuments({ 
      documentUrl: { $ne: null }, 
      documentVerified: false 
    });
    const totalRooms = await Room.countDocuments();
    const activeRooms = await Room.countDocuments({ status: 'ACTIVE' });
    
    // Usuários registrados nos últimos 7 dias
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    
    const newUsers = await User.countDocuments({
      createdAt: { $gte: lastWeekDate }
    });
    
    // Valor total depositado e ganho pelos usuários
    const users = await User.find();
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    
    users.forEach(user => {
      if (user.paymentHistory && user.paymentHistory.length > 0) {
        user.paymentHistory.forEach(payment => {
          if (payment.type === 'deposit' && payment.amount > 0) {
            totalDeposits += payment.amount;
          } else if (payment.type === 'withdrawal' && payment.amount < 0) {
            totalWithdrawals += Math.abs(payment.amount);
          }
        });
      }
    });
    
    // Salas criadas nos últimos 7 dias
    const newRooms = await Room.countDocuments({
      createdAt: { $gte: lastWeekDate }
    });
    
    res.status(200).json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          new: newUsers,
          pendingDocuments
        },
        rooms: {
          total: totalRooms,
          active: activeRooms,
          new: newRooms
        },
        finances: {
          totalDeposits,
          totalWithdrawals,
          balance: totalDeposits - totalWithdrawals
        }
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao obter estatísticas',
      error: error.message
    });
  }
};