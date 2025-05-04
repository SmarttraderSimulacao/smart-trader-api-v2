const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para proteger rotas
exports.protect = async (req, res, next) => {
  console.log('Auth middleware called');
  try {
    let token;
    
    // Verificar se o token existe no header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      console.log('Found Bearer token in header');
      // Obter token do header
      token = req.headers.authorization.split(' ')[1];
    } else {
      console.log('No Bearer token found in header:', req.headers);
    }
    
    // Verificar se o token existe
    if (!token) {
      console.log('No token provided, returning 401');
      return res.status(401).json({
        success: false,
        message: 'Acesso não autorizado'
      });
    }
    
    try {
      console.log('Verifying token...');
      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token verified successfully, user ID:', decoded.id);
      
      // Adicionar usuário à requisição
      req.user = await User.findById(decoded.id);
      
      if (!req.user) {
        console.log('User not found in database for ID:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }
      
      console.log('Authentication successful for user:', req.user._id);
      next();
    } catch (error) {
      console.error('Token verification error:', error.message, error.stack);
      return res.status(401).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }
  } catch (error) {
    console.error('Unexpected error in protect middleware:', error.message, error.stack);
    return res.status(500).json({
      success: false,
      message: 'Erro interno no servidor'
    });
  }
};

// Middleware para verificar role de admin
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado: Permissão insuficiente'
      });
    }
    next();
  };
};

// Middleware para autenticar via WebSocket
exports.authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      return next(new Error('Autenticação necessária'));
    }
    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Buscar usuário
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error('Usuário não encontrado'));
    }
    // Adicionar usuário ao objeto socket
    socket.user = user;
    next();
  } catch (error) {
    console.error('Erro de autenticação WebSocket:', error);
    next(new Error('Token inválido ou expirado'));
  }
};