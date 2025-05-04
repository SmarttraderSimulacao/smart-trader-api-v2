const express = require('express');
const router = express.Router();

// Importar middleware de autenticação conforme está exportado no seu auth.js
const auth = require('../middleware/auth');

// Nova forma de importar o Mercado Pago
const { MercadoPagoConfig, Payment } = require('mercadopago');

// Configurar o cliente do Mercado Pago
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN 
});
const payment = new Payment(client);

// Endpoint para gerar um pagamento PIX - usando o middleware protect
router.post('/create-pix', auth.protect, async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user._id; // Obtém o ID do usuário autenticado
    
    console.log(`[DEBUG] Criando pagamento PIX para sala ${roomId} e usuário ${userId}`);
    console.log(`[DEBUG] Corpo da requisição:`, req.body);
    
    // Buscar dados da sala
    const Room = require('../models/Room');
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }
    
    // Verificar se o usuário já está inscrito
    const alreadyJoined = room.participants.some(
      participant => participant.userId.toString() === userId.toString()
    );
    
    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        message: 'Você já está inscrito nesta sala'
      });
    }
    
    // Criar pagamento PIX
    const paymentData = {
      transaction_amount: room.entryFee,
      description: `Taxa de entrada - ${room.name}`,
      payment_method_id: 'pix',
      payer: {
        email: req.user.email || 'usuario@example.com',
      },
      metadata: {
        userId: userId.toString(),
        roomId: roomId
      }
    };
    
    console.log(`[DEBUG] Dados de pagamento a serem enviados:`, JSON.stringify(paymentData));
    
    const result = await payment.create({ body: paymentData });
    console.log(`[DEBUG] Resposta da criação de pagamento:`, JSON.stringify(result));
    
    // Retornar os dados do PIX para o cliente
    res.status(200).json({
      success: true,
      payment: {
        id: result.id.toString(), // Convertendo para string para evitar problemas de notação científica
        qrCode: result.point_of_interaction.transaction_data.qr_code_base64,
        qrCodeText: result.point_of_interaction.transaction_data.qr_code,
        expirationDate: result.point_of_interaction.transaction_data.expiration_date
      }
    });
    
  } catch (error) {
    console.error('Erro ao criar pagamento PIX:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao gerar pagamento PIX',
      error: error.message
    });
  }
});

// Endpoint para verificar status do pagamento - usando o middleware protect
// Rota existente para verificar pagamento por ID
router.get('/check-payment/:paymentId', auth.protect, async (req, res) => {
  try {
    const { paymentId } = req.params;
    console.log(`[DEBUG] Verificando pagamento com ID: ${paymentId}`);
    
    // Verificar se o ID existe no formato correto
    if (!paymentId || paymentId.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: 'ID de pagamento inválido' 
      });
    }
    
    try {
      // CORREÇÃO: Se o ID vier em notação científica, converter para inteiro
      let formattedId = paymentId;
      
      // Se tiver notação científica (contém 'E' ou 'e')
      if (paymentId.includes('E') || paymentId.includes('e')) {
        formattedId = parseFloat(paymentId).toFixed(0);
      }
      
      // Se tiver pontos (como 1.33558)
      if (paymentId.includes('.')) {
        formattedId = paymentId.split('.')[0];
      }
      
      console.log(`[DEBUG] ID formatado para consulta: ${formattedId}`);
      
      const result = await payment.get({ id: formattedId });
      console.log(`[DEBUG] Resposta do Mercado Pago:`, JSON.stringify(result));
      
      return res.status(200).json({
        success: true,
        status: result.status,
        detail: result.status_detail
      });
    } catch (mpError) {
      console.error(`[DEBUG] Erro na API do Mercado Pago:`, mpError);
      
      // Devolver uma resposta mais amigável
      return res.status(404).json({
        success: false,
        message: 'Pagamento não encontrado ou pendente. Tente novamente em alguns instantes.',
        error: 'O pagamento pode não ter sido processado ainda pelo Mercado Pago'
      });
    }
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar status do pagamento',
      error: error.message
    });
  }
});

// Nova rota para verificar se o usuário já está inscrito na sala
router.get('/check-enrollment/:roomId', auth.protect, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    
    console.log(`[DEBUG] Verificando inscrição do usuário ${userId} na sala ${roomId}`);
    
    // Verificar se a sala existe
    const Room = require('../models/Room'); // Ajuste o caminho conforme sua estrutura
    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Sala não encontrada'
      });
    }
    
    // Verificar se o usuário já está inscrito na sala
    const isEnrolled = room.participants.some(p => 
      p.userId.toString() === userId.toString()
    );
    
    console.log(`[DEBUG] Usuário ${userId} ${isEnrolled ? 'está' : 'não está'} inscrito na sala ${roomId}`);
    
    return res.status(200).json({
      success: true,
      isEnrolled: isEnrolled,
      needsPayment: room.entryFee > 0 && !isEnrolled,
      entryFee: room.entryFee
    });
    
  } catch (error) {
    console.error('Erro ao verificar inscrição na sala:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro ao verificar inscrição na sala',
      error: error.message
    });
  }
});

// Webhook para receber notificações do Mercado Pago (sem autenticação)
router.post('/webhook', async (req, res) => {
  try {
    const { id, topic } = req.query;
    console.log(`[DEBUG] Webhook recebido: ${topic}, ID: ${id}`);
    console.log(`[DEBUG] Corpo do webhook:`, req.body);
    
    if (topic === 'payment') {
      try {
        // CORREÇÃO: Se o ID vier em notação científica, converter para inteiro
        let formattedId = id;
        
        // Se tiver notação científica (contém 'E' ou 'e')
        if (id.includes('E') || id.includes('e')) {
          formattedId = parseFloat(id).toFixed(0);
        }
        
        // Se tiver pontos (como 1.33558)
        if (id.includes('.')) {
          formattedId = id.split('.')[0];
        }
        
        console.log(`[DEBUG] Consultando pagamento do webhook com ID formatado: ${formattedId}`);
        const result = await payment.get({ id: formattedId });
        console.log(`[DEBUG] Resultado da consulta de pagamento do webhook:`, JSON.stringify(result));
        
        if (result.status === 'approved') {
          // Extrair metadados
          const { userId, roomId } = result.metadata || {};
          
          if (userId && roomId) {
            console.log(`[DEBUG] Pagamento aprovado para usuário ${userId} e sala ${roomId}`);
            
            // Adicionar usuário à sala
            const Room = require('../models/Room');
            const User = require('../models/User');
            
            const room = await Room.findById(roomId);
            const user = await User.findById(userId);
            
            if (room && user) {
              // Verificar se o usuário já está inscrito
              const isParticipant = room.participants.some(
                p => p.userId.toString() === userId
              );
              
              if (!isParticipant) {
                // Adicionar usuário como participante
                room.participants.push({
                  userId: user._id,
                  username: user.username,
                  initialCapital: 100000,
                  currentCapital: 100000,
                  openPositions: []
                });
                
                // Recalcular prêmio total
                if (room.entryFee > 0) {
                  room.totalPrizePool = Math.floor(room.entryFee * room.participants.length * 0.8);
                }
                
                await room.save();
                console.log(`Usuário ${user.username} adicionado à sala ${room.name} após pagamento`);
              } else {
                console.log(`Usuário ${user.username} já estava inscrito na sala ${room.name}`);
              }
            } else {
              console.log(`[DEBUG] Sala ou usuário não encontrados para pagamento aprovado`);
            }
          } else {
            console.log(`[DEBUG] Metadados incompletos no pagamento:`, result.metadata);
          }
        } else {
          console.log(`[DEBUG] Status do pagamento não é 'approved': ${result.status}`);
        }
      } catch (paymentError) {
        console.error(`[DEBUG] Erro ao consultar pagamento do webhook:`, paymentError);
      }
    }
    
    // Sempre retorna 200 para o Mercado Pago (requisito da plataforma)
    res.status(200).send('OK');
  } catch (error) {
    console.error('Erro no webhook:', error);
    // Mesmo com erro, devolvemos 200 para o Mercado Pago
    res.status(200).send('Error handled');
  }
});

module.exports = router;