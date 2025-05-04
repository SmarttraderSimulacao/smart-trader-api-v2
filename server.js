const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const EventEmitter = require('events');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/apiRoutes');
const competitionCandleGenerator = require('./services/competitionCandleGenerator');
const { authenticateSocket } = require('./middleware/auth');
require('dotenv').config();

console.log('Access Token:', process.env.MERCADO_PAGO_ACCESS_TOKEN);

// Objeto global para armazenar rankings
const roomRankings = {};

// Configurar o fuso horário para Brasília (GMT-3)
process.env.TZ = 'America/Sao_Paulo';
console.log(`Servidor usando fuso horário: ${new Date().toString()}`);

// Inicializar o app
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const roomRoutes = require('./routes/roomRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
app.use('/api', apiRoutes);
app.use('/api', roomRoutes);
app.use('/api', tradeRoutes);
// Rotas administrativas
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

// MODIFICAÇÃO: Rotas de pagamento - adicionando o console.log para debug
const paymentRoutes = require('./routes/paymentRoutes');
app.use('/api/payments', (req, res, next) => {
  console.log(`[DEBUG] Requisição para rota de pagamento: ${req.method} ${req.originalUrl}`);
  if (req.method === 'GET' && req.originalUrl.includes('check-payment')) {
    console.log(`[DEBUG] Verificando pagamento com ID: ${req.params.paymentId || 'ID não disponível'}`);
  }
  next();
}, paymentRoutes);

// Test endpoint
app.get('/api/test-connection', (req, res) => {
  res.status(200).json({ message: 'Connection successful!' });
});

// Endpoint para ativar uma sala (temporário)
app.get('/api/activate-room/:roomId', async (req, res) => {
  try {
    const roomId = req.params.roomId;
    console.log(`Tentando ativar sala com ID: ${roomId}`);
    
    const Room = require('./models/Room');
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ success: false, message: 'Sala não encontrada' });
    }
    
    // Atualizar status da sala para ACTIVE
    room.status = 'ACTIVE';
    await room.save();
    
    console.log(`Sala ${room.name} (${room._id}) ativada com sucesso!`);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Sala ativada com sucesso',
      room: {
        id: room._id,
        name: room.name,
        status: room.status,
        participants: room.participants.length
      } 
    });
  } catch (error) {
    console.error('Erro ao ativar sala:', error);
    return res.status(500).json({ success: false, message: 'Erro ao ativar sala' });
  }
});

// NOVO ENDPOINT: Ativar TODAS as salas sem restrições
app.get('/api/force-activate-all-rooms', async (req, res) => {
  try {
    const Room = require('./models/Room');
    
    // Buscar TODAS as salas, independentemente do status
    const rooms = await Room.find({});
    console.log(`Encontradas ${rooms.length} salas no total`);
    
    let activatedCount = 0;
    
    // Ativar cada sala e ajustar horários
    for (const room of rooms) {
      console.log(`Ativando sala: ${room.name} (${room._id}), status atual: ${room.status}`);
      room.status = 'ACTIVE';
      room.startTime = '00:00';
      room.endTime = '23:59';
      await room.save();
      activatedCount++;
      
      // Atualizar o ranking armazenado
      roomRankings[room._id.toString()] = room.getCurrentRanking();
    }
    
    return res.status(200).json({
      success: true,
      message: `${activatedCount} salas ativadas com sucesso`,
      totalRooms: rooms.length
    });
  } catch (error) {
    console.error('Erro ao ativar todas as salas:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erro ao ativar todas as salas',
      error: error.message
    });
  }
});

// Endpoint para verificar e ativar salas pendentes
app.get('/api/check-pending-rooms', async (req, res) => {
  try {
    const Room = require('./models/Room');
    
    // Buscar salas pendentes
    const pendingRooms = await Room.find({ status: 'PENDING' });
    console.log(`Encontradas ${pendingRooms.length} salas pendentes`);
    
    let activatedCount = 0;
    
    // Ativar cada sala
    for (const room of pendingRooms) {
      console.log(`Ativando sala: ${room.name} (${room._id})`);
      room.status = 'ACTIVE';
      room.startTime = '00:00';
      room.endTime = '23:59';
      await room.save();
      activatedCount++;
    }
    
    return res.status(200).json({
      success: true,
      message: `${activatedCount} salas ativadas com sucesso`,
      totalRooms: pendingRooms.length
    });
  } catch (error) {
    console.error('Erro ao verificar salas pendentes:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Erro ao verificar salas pendentes',
      error: error.message
    });
  }
});

// Database
connectDB();

// 1. Inicialização do Gerador de Candles
competitionCandleGenerator.initialize(10000);
// Adicionar estas linhas para garantir volatilidade
competitionCandleGenerator.volatilityFactor = 0.002; // 0.2% de volatilidade
competitionCandleGenerator.resetTrend(); // Gerar tendência inicial

console.log('Gerador inicializado com preço:', competitionCandleGenerator.lastPrice);

// 2. Configuração do EventEmitter para candles completos
competitionCandleGenerator.eventEmitter = new EventEmitter();

// Adicionar este código no server.js junto com os outros eventos do competitionCandleGenerator
competitionCandleGenerator.eventEmitter.on('room_closing', (data) => {
  console.log(`Sala ${data.name} entrando em processo de encerramento!`);
  
  // Notificar todos os clientes na sala
  io.to(`room:${data.roomId}`).emit('room_status_changed', {
    roomId: data.roomId,
    status: 'CLOSING',
    message: 'A sala está sendo encerrada. Novas operações não são permitidas. O resultado final será calculado em 5 segundos.'
  });
});

// 3. Modificação do finalizeCurrentCandle para emitir eventos
const originalFinalize = competitionCandleGenerator.finalizeCurrentCandle.bind(competitionCandleGenerator);
competitionCandleGenerator.finalizeCurrentCandle = function(timeframe = 1) {
  const finalizedCandle = originalFinalize(timeframe);
  this.eventEmitter.emit('candle_completed', finalizedCandle);
  return finalizedCandle;
};

// 4. NOVA FUNÇÃO: Verificar e gerenciar salas baseado em horários
async function checkRoomSchedules() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    console.log(`[${now.toLocaleTimeString()}] Verificando horários de salas (${currentHour}:${currentMinute})...`);
    
    // Usar diretamente o método do competitionCandleGenerator que agora tem a lógica melhorada
    const result = await competitionCandleGenerator.checkCompetitionTimes();
    
    if (result.activatedCount > 0 || result.closedCount > 0) {
      console.log(`Salas gerenciadas automaticamente: ${result.activatedCount} ativadas, ${result.closedCount} encerradas`);
    }
    
    // Para salas que foram ativadas, atualizar os rankings armazenados
    if (result.activeRooms && result.activeRooms.length > 0) {
      const Room = require('./models/Room');
      
      for (const roomId of result.activeRooms) {
        const room = await Room.findById(roomId);
        if (room) {
          // Atualizar ranking armazenado
          roomRankings[roomId] = room.getCurrentRanking();
          
          // Notificar clientes na sala
          io.to(`room:${roomId}`).emit('room_status_changed', {
            roomId: roomId,
            status: room.status,
            message: `A sala está ${room.status === 'ACTIVE' ? 'ativa' : 'encerrada'} conforme horário programado`
          });
          
          // Enviar ranking atualizado
          io.to(`room:${roomId}`).emit('room_ranking', roomRankings[roomId]);
        }
      }
    }
  } catch (error) {
    console.error('Erro na verificação de horários de salas:', error);
  }
}

// Configurar verificação de horários de salas a cada minuto
const roomScheduleInterval = setInterval(checkRoomSchedules, 60 * 1000);

// Executar verificação ao iniciar
checkRoomSchedules();

// Eventos para sala ativada/encerrada
competitionCandleGenerator.eventEmitter.on('room_activated', (data) => {
  console.log(`Sala ${data.name} ativada automaticamente!`);
  
  // Notificar todos os clientes na sala
  io.to(`room:${data.roomId}`).emit('room_status_changed', {
    roomId: data.roomId,
    status: 'ACTIVE',
    message: 'A sala foi ativada automaticamente pelo sistema!'
  });
});

competitionCandleGenerator.eventEmitter.on('room_closed', (data) => {
  console.log(`Sala ${data.name} encerrada automaticamente!`);
  
  // Notificar todos os clientes na sala
  io.to(`room:${data.roomId}`).emit('room_status_changed', {
    roomId: data.roomId,
    status: 'CLOSED',
    message: 'A sala foi encerrada automaticamente pelo sistema!'
  });
});

// WebSocket Connection
io.on('connection', (socket) => {
  console.log('Novo cliente conectado. ID:', socket.id);
  
  // Enviar candle atual ao conectar
  const currentCandle = competitionCandleGenerator.getCurrentFormingCandle();
  socket.emit('price_update', {
    price: competitionCandleGenerator.lastPrice,
    candle: currentCandle,
    isNewCandle: false,
    serverTime: Date.now()
  });
  
  // INSERIR O CÓDIGO AQUI:
  socket.on('ping_test', (data) => {
    console.log('Recebido ping_test de cliente', socket.id);
    socket.emit('pong_test', { timestamp: Date.now() });
  });

  // Handler para solicitações manuais de ranking
  socket.on('get_room_ranking', async (data) => {
    console.log('Evento get_room_ranking recebido:', data);
    
    try {
      const roomId = data?.roomId;
      if (!roomId) {
        console.log('RoomId não fornecido na solicitação de ranking');
        socket.emit('error', { message: 'RoomId é obrigatório' });
        return;
      }
      
      console.log(`Cliente ${socket.id} solicitou ranking da sala ${roomId}`);
      
      // Verificar se já temos um ranking armazenado
      if (roomRankings[roomId]) {
        console.log(`Usando ranking armazenado para sala ${roomId}`);
        socket.emit('room_ranking', roomRankings[roomId]);
        return;
      }
      
      // Se não temos ranking armazenado, buscar do banco de dados
      try {
        const Room = require('./models/Room');
        const room = await Room.findById(roomId);
        
        if (room) {
          console.log(`Sala encontrada: ${room.name}, status: ${room.status}, participantes: ${room.participants.length}`);
          
          // Importante: NÃO ativar a sala automaticamente, apenas informar seu status atual
          console.log(`Status atual da sala ${room.name}: ${room.status}`);
          
          // Gerar ranking
          const ranking = room.getCurrentRanking();
          
          // Atualizar o ranking com o status atual da sala
          ranking.roomStatus = room.status;
          
          // Armazenar no objeto global
          roomRankings[roomId] = ranking;
          
          console.log(`Ranking gerado com ${ranking.ranking?.length || 0} participantes`);
          
          // Enviar para o cliente
          socket.emit('room_ranking', ranking);
          
        } else {
          console.log(`Sala ${roomId} não encontrada`);
          
          // Criar um ranking temporário
          const tempRanking = {
            roomId: roomId,
            roomName: "Sala Temporária",
            roomStatus: "PENDING",
            ranking: [{
              position: 1,
              userId: "user1",
              username: "Você",
              capital: 100000,
              profitPercentage: 0
            }],
            updatedAt: Date.now()
          };
          
          // Armazenar o ranking temporário
          roomRankings[roomId] = tempRanking;
          
          socket.emit('room_ranking', tempRanking);
          console.log('Ranking temporário enviado');
        }
      } catch (dbError) {
        console.error('Erro ao acessar o banco de dados:', dbError);
        
        // Criar um ranking de fallback
        const fallbackRanking = {
          roomId: roomId,
          roomName: "Ranking (Fallback)",
          roomStatus: "PENDING",
          ranking: [{
            position: 1,
            userId: socket.user?._id?.toString() || "unknown",
            username: socket.user?.username || "Você",
            capital: 100000,
            profitPercentage: 0
          }],
          updatedAt: Date.now()
        };
        
        // Armazenar o ranking de fallback
        roomRankings[roomId] = fallbackRanking;
        
        socket.emit('room_ranking', fallbackRanking);
        console.log('Ranking de fallback enviado devido a erro de BD');
      }
    } catch (error) {
      console.error(`Erro geral ao obter ranking da sala:`, error);
      
      // Enviar ranking de emergência
      const emergencyRanking = {
        roomId: data?.roomId || "unknown",
        roomName: "Ranking (Emergência)",
        roomStatus: "PENDING",
        ranking: [{
          position: 1,
          userId: "emergency",
          username: "Usuário",
          capital: 100000,
          profitPercentage: 0
        }],
        updatedAt: Date.now()
      };
      
      socket.emit('room_ranking', emergencyRanking);
      console.log('Ranking de emergência enviado');
    }
  });

  // Autenticação (mantido original)
  socket.on('authenticate', async (token) => {
    try {
      await authenticateSocket(socket, () => {});
      console.log(`Cliente ${socket.id} autenticado como ${socket.user.username}`);
      
      socket.emit('user_data', {
        _id: socket.user._id,
        username: socket.user.username,
        email: socket.user.email,
        balance: socket.user.balance
      });
    } catch (error) {
      console.error(`Erro de autenticação do socket ${socket.id}:`, error.message);
      socket.emit('auth_error', { message: error.message });
    }
  });

  // Room handling (MODIFICADO para melhorar sincronização inicial)
  socket.on('join_room', async (roomId) => {
    try {
      socket.join(`room:${roomId}`);
      console.log(`Cliente ${socket.id} entrou na sala ${roomId}`);
      
      // Buscar detalhes da sala
      const Room = require('./models/Room');
      const room = await Room.findById(roomId);
      
      if (room) {
        console.log(`Sala encontrada ao entrar: ${room.name}, status: ${room.status}`);
        
        // Enviar status completo da sala para o cliente
        socket.emit('room_status_update', {
          roomId: roomId,
          name: room.name,
          status: room.status,
          startTime: room.startTime,
          endTime: room.endTime,
          message: `Você entrou na sala ${room.name} (status: ${room.status})`
        });
        
        // Se a sala estiver ativa, enviar também o candle atual
        if (room.status === 'ACTIVE') {
          const currentCandle = competitionCandleGenerator.getCurrentFormingCandle();
          const currentPrice = competitionCandleGenerator.lastPrice;
          
          socket.emit('price_update', {
            price: currentPrice,
            candle: currentCandle,
            isNewCandle: false,
            serverTime: Date.now(),
            isInitialSync: true // Sinalizar que este é um evento de sincronização inicial
          });
          
          console.log(`Enviado status e preço atual (${currentPrice}) para cliente ao entrar na sala ativa`);
        }
        
        // Gerar e armazenar o ranking
        const ranking = room.getCurrentRanking();
        
        // Adicionar o status da sala ao ranking
        ranking.roomStatus = room.status;
        
        roomRankings[roomId] = ranking;
        
        console.log(`Ranking gerado e armazenado: ${ranking.ranking?.length || 0} participantes`);
        socket.emit('room_ranking', ranking);
        
        // Informar ao cliente o status atual da sala (mantido para compatibilidade)
        socket.emit('room_status', {
          roomId: roomId,
          status: room.status,
          startTime: room.startTime,
          endTime: room.endTime
        });
      } else {
        console.log(`Sala ${roomId} não encontrada ao entrar`);
        socket.emit('error', { message: 'Sala não encontrada' });
      }
    } catch (error) {
      console.error(`Erro ao entrar na sala ${roomId}:`, error);
      socket.emit('error', { message: 'Erro ao entrar na sala' });
    }
  });

  socket.on('leave_room', (roomId) => {
    socket.leave(`room:${roomId}`);
    console.log(`Cliente ${socket.id} saiu da sala ${roomId}`);
  });

  socket.on('place_order', async (orderData) => {
  console.log('===== ORDEM RECEBIDA =====');
  console.log('Cliente:', socket.id);
  console.log('Usuário:', socket.user ? socket.user.username : 'Não autenticado');
  console.log('Dados da ordem:', orderData);
  
  try {
    if (!socket.user) {
      console.log('Usuário não autenticado, tentando recuperar autenticação...');
      
      // Verificar se temos um userId na ordem
      if (orderData.userId) {
        console.log(`Tentando usar userId da ordem: ${orderData.userId}`);
        
        const User = require('./models/User');
        const user = await User.findById(orderData.userId);
        
        if (user) {
          console.log(`Usuário encontrado: ${user.username}, usando para processar ordem`);
          
          // Verificar status da sala antes de processar a ordem
          const Room = require('./models/Room');
          const room = await Room.findById(orderData.roomId);
          
          if (!room) {
            console.log(`Sala ${orderData.roomId} não encontrada`);
            socket.emit('error', { message: 'Sala não encontrada' });
            return;
          }
          
          // MODIFICADO: Verificar se a sala está ativa e negar operação caso esteja em CLOSING ou outro estado
          if (room.status !== 'ACTIVE') {
            let mensagem = 'Sala não está ativa. Operações só são permitidas em salas ativas.';
            
            if (room.status === 'CLOSING') {
              mensagem = 'Sala está sendo encerrada. Novas operações não são permitidas.';
              console.log(`Sala ${room.name} em processo de encerramento, rejeitando ordem`);
            } else {
              console.log(`Sala ${room.name} não está ativa, status atual: ${room.status}`);
            }
            
            socket.emit('error', { message: mensagem });
            return;
          }
          
          // Verificar se o usuário está inscrito na sala
          let participant = room.participants.find(
            p => p.userId.toString() === user._id.toString()
          );
          
          // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
          if (!participant) {
            console.log(`Usuário ${user.username} não está inscrito na sala. Inscrevendo automaticamente...`);
            
            // Adicionar usuário como participante
            room.participants.push({
              userId: user._id,
              username: user.username,
              initialCapital: 100000,
              currentCapital: 100000,
              openPositions: []
            });
            
            await room.save();
            console.log(`Usuário ${user.username} inscrito automaticamente na sala ${room.name}`);
          }
          
          // Processar ordem usando o userId fornecido
          const tradeController = require('./controllers/tradeController');
          
          const trade = await tradeController.createTradeInternal(
            user._id,
            orderData.roomId,
            orderData.type,
            orderData.size || 1,
            competitionCandleGenerator.lastPrice
          );
          
          socket.emit('order_confirmed', trade);
          
          // Atualizar o ranking
          const updatedRoom = await Room.findById(orderData.roomId);
          if (updatedRoom) {
            // Gerar e atualizar o ranking armazenado
            const ranking = updatedRoom.getCurrentRanking();
            
            // Adicionar o status da sala ao ranking
            ranking.roomStatus = updatedRoom.status;
            
            roomRankings[orderData.roomId] = ranking;
            
            console.log(`Ranking atualizado: ${JSON.stringify(ranking.ranking)}`);
            
            // Enviar o ranking atualizado para todos na sala
            io.to(`room:${orderData.roomId}`).emit('room_ranking', ranking);
          }
          
          return;
        }
      }
      
      console.log('Não foi possível autenticar o usuário, rejeitando ordem');
      socket.emit('error', { message: 'Não autenticado' });
      return;
    }
    
    // Caso o usuário esteja autenticado via socket
    const Room = require('./models/Room');
    const room = await Room.findById(orderData.roomId);
    
    if (!room) {
      console.log(`Sala ${orderData.roomId} não encontrada`);
      socket.emit('error', { message: 'Sala não encontrada' });
      return;
    }
    
    // MODIFICADO: Verificar se a sala está ativa e negar operação caso esteja em CLOSING ou outro estado
    if (room.status !== 'ACTIVE') {
      let mensagem = 'Sala não está ativa. Operações só são permitidas em salas ativas.';
      
      if (room.status === 'CLOSING') {
        mensagem = 'Sala está sendo encerrada. Novas operações não são permitidas.';
        console.log(`Sala ${room.name} em processo de encerramento, rejeitando ordem`);
      } else {
        console.log(`Sala ${room.name} não está ativa, status atual: ${room.status}`);
      }
      
      socket.emit('error', { message: mensagem });
      return;
    }
    
    // Verificar se o usuário está inscrito na sala
    let participant = room.participants.find(
      p => p.userId.toString() === socket.user._id.toString()
    );
    
    // Se o usuário não estiver inscrito, inscrevê-lo automaticamente
    if (!participant) {
      console.log(`Usuário ${socket.user.username} não está inscrito na sala. Inscrevendo automaticamente...`);
      
      // Adicionar usuário como participante
      room.participants.push({
        userId: socket.user._id,
        username: socket.user.username,
        initialCapital: 100000,
        currentCapital: 100000,
        openPositions: []
      });
      
      await room.save();
      console.log(`Usuário ${socket.user.username} inscrito automaticamente na sala ${room.name}`);
    }
    
    const tradeController = require('./controllers/tradeController');
    
    const trade = await tradeController.createTradeInternal(
      socket.user._id,
      orderData.roomId,
      orderData.type,
      orderData.size || 1,
      competitionCandleGenerator.lastPrice
    );
    
    socket.emit('order_confirmed', trade);
    
    // Atualizar o ranking
    const updatedRoom = await Room.findById(orderData.roomId);
    if (updatedRoom) {
      // Gerar e atualizar o ranking armazenado
      const ranking = updatedRoom.getCurrentRanking();
      
      // Adicionar o status da sala ao ranking
      ranking.roomStatus = updatedRoom.status;
      
      roomRankings[orderData.roomId] = ranking;
      
      // Enviar o ranking atualizado para todos na sala
      io.to(`room:${orderData.roomId}`).emit('room_ranking', ranking);
    }
  } catch (error) {
    console.error('Erro ao processar ordem:', error.message);
    socket.emit('error', { message: `Erro ao enviar ordem: ${error.message}` });
  }
});

  socket.on('disconnect', () => {
    console.log('Cliente desconectado. ID:', socket.id);
  });
});

// 5. Sistema de Atualização de Preços
const tickInterval = setInterval(() => {
  try {
    const newPrice = competitionCandleGenerator.getNextTick();
    const currentCandle = competitionCandleGenerator.getCurrentFormingCandle();
    
    io.emit('price_update', {
      price: newPrice,
      candle: {
        timestamp: currentCandle.timestamp,
        open: currentCandle.open,
        high: currentCandle.high,
        low: currentCandle.low,
        close: currentCandle.close,
        timeframe: currentCandle.timeframe
      },
      isNewCandle: false,
      serverTime: Date.now()
    });
    
    // Reduzir a verbosidade dos logs
    if (Math.random() < 0.05) { // Só mostrar ~5% dos updates para não lotar o console
      console.log(`Emitido price_update: preço=${newPrice}`);
    }

  } catch (error) {
    console.error('Erro no tick interval:', error);
  }
}, 500);

// 6. Sistema de Candles Completos
const candleInterval = setInterval(async () => {
  try {
    console.log('Finalizando candle atual...');
    const finalizedCandle = competitionCandleGenerator.finalizeCurrentCandle(1);
    
    const Candle = require('./models/Candle');
    await Candle.create(finalizedCandle);
    
    console.log('Candle finalizado:', {
      timestamp: new Date(finalizedCandle.timestamp).toISOString(),
      open: finalizedCandle.open,
      close: finalizedCandle.close
    });
  } catch (error) {
    console.error('Erro ao finalizar candle:', error);
  }
}, 60000);

// 7. Verificação de Competições (atualizado para usar o ranking armazenado)
const competitionInterval = setInterval(async () => {
  try {
    const result = await competitionCandleGenerator.checkCompetitionTimes();
    
    if (result.activeRooms?.length > 0) {
      console.log('Salas ativas:', result.activeRooms);
      
      for (const roomId of result.activeRooms) {
        const Room = require('./models/Room');
        const room = await Room.findById(roomId);
        
        if (room) {
          // Gerar e atualizar o ranking armazenado
          const ranking = room.getCurrentRanking();
          
          // Adicionar o status da sala ao ranking
          ranking.roomStatus = room.status;
          
          roomRankings[roomId] = ranking;
          
          // Enviar o ranking atualizado para todos na sala
          io.to(`room:${roomId}`).emit('room_ranking', ranking);
        }
      }
    }
  } catch (error) {
    console.error('Erro ao verificar competições:', error);
  }
}, 60000);

// Eventos de Candles Completos
competitionCandleGenerator.eventEmitter.on('candle_completed', (finalizedCandle) => {
  io.emit('price_update', {
    price: finalizedCandle.close,
    candle: finalizedCandle,
    isNewCandle: true,
    serverTime: Date.now()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(tickInterval);
  clearInterval(candle);
  clearInterval(candleInterval);
  clearInterval(competitionInterval);
  clearInterval(roomScheduleInterval); // Limpar o novo intervalo
  server.close();
});

// NOVO ENDPOINT: Verificação de pagamento com melhor tratamento de erros
app.get('/api/debug-payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    console.log(`[DEBUG] Verificando detalhes do pagamento ID: ${paymentId}`);
    
    // Verificar o formato do ID
    if (!paymentId || paymentId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'ID de pagamento inválido'
      });
    }
    
    // Configurar o cliente do Mercado Pago
    const mercadopago = require('mercadopago');
    mercadopago.configure({
      access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
    });
    
    // Logs detalhados do processo
    console.log(`[DEBUG] Access Token configurado: ${process.env.MERCADO_PAGO_ACCESS_TOKEN?.substring(0, 10)}...`);
    console.log(`[DEBUG] Fazendo requisição para MP com payment_id: ${paymentId}`);
    
    // Tente buscar o pagamento 
    const payment = await mercadopago.payment.get(paymentId);
    
    return res.json({
      success: true,
      payment: payment.response || payment,
      message: 'Detalhes do pagamento recuperados com sucesso'
    });
    
  } catch (error) {
    console.error('[DEBUG] Erro ao verificar pagamento:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar pagamento',
      error: error.message,
      stack: error.stack
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Iniciado em: ${new Date().toISOString()}`);
});