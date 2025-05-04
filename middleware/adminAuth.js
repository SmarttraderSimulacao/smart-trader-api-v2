const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware para verificar se o usuário é administrador
 */
exports.isAdmin = async (req, res, next) => {
  try {
    // Verificar token JWT
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
      return res.status(401).json({
        success: false,
        message: 'Acesso não autorizado. Token ausente ou inválido.'
      });
    }

    const token = req.headers.authorization.split(' ')[1];
    
    // Verificar validade do token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar se o usuário existe e é administrador
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    // Verificar se o usuário é administrador
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso restrito a administradores'
      });
    }
    
    // Anexar dados do usuário à requisição
    req.user = user;
    next();
  } catch (error) {
    console.error('Erro na autenticação de administrador:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro na autenticação',
      error: error.message
    });
  }
};