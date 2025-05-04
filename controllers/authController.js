const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Gerar token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Registrar um novo usuário
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  console.log('Requisição de cadastro recebida:', req.body); // <--- LOG ADICIONADO
  try {
    const { username, email, password, pixKey } = req.body;

    // Verificar se o usuário já existe
    const userExists = await User.findOne({
      $or: [
        { email },
        { username }
      ]
    });

    if (userExists) {
      console.log('Usuário ou email já cadastrado:', { email, username }); // <--- LOG ADICIONADO
      return res.status(400).json({
        success: false,
        message: 'Usuário ou email já cadastrado'
      });
    }

    // Criar usuário
    const user = await User.create({
      username,
      email,
      password,
      pixKey
    });

    // Gerar token
    const token = generateToken(user._id);

    console.log('Usuário criado e token gerado:', { userId: user._id, token }); // <--- LOG ADICIONADO

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        pixKey: user.pixKey,
        balance: user.balance,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao registrar usuário',
      error: error.message
    });
  }
};

// @desc    Login de usuário
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar se o usuário existe
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // Verificar senha
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // Gerar token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        pixKey: user.pixKey,
        balance: user.balance,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer login',
      error: error.message
    });
  }
};

// @desc    Obter perfil do usuário logado
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        pixKey: user.pixKey,
        balance: user.balance,
        role: user.role,
        paymentHistory: user.paymentHistory
      }
    });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar perfil',
      error: error.message
    });
  }
};

// @desc    Atualizar dados do usuário
// @route   PUT /api/auth/me
// @access  Private
exports.updateMe = async (req, res) => {
  try {
    const { username, email, pixKey } = req.body;

    // Construir objeto de atualização
    const updateFields = {};
    if (username) updateFields.username = username;
    if (email) updateFields.email = email;
    if (pixKey) updateFields.pixKey = pixKey;

    // Atualizar usuário
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        pixKey: user.pixKey,
        balance: user.balance,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar perfil',
      error: error.message
    });
  }
};

// @desc    Upload de documento do usuário
// @route   POST /api/auth/upload-document
// @access  Private (requer token)
exports.uploadDocument = (req, res) => {
  try {
    console.log('Função uploadDocument chamada!');
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Nenhum arquivo foi enviado.' });
    }
    
    console.log('Arquivo recebido:', req.file);
    
    // Create the file URL (adjust based on your server configuration)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/documents/${req.file.filename}`;
    
    // Return the file URL without associating it with a user for now
    // This allows document uploads without authentication for registration
    return res.status(200).json({
      success: true,
      message: 'Documento enviado com sucesso',
      url: fileUrl
    });
    
    /* Original code that requires authentication:
    // If we have authentication and want to associate the document with a user:
    if (req.user && req.user.id) {
      // Update user with document URL
      User.findByIdAndUpdate(
        req.user.id,
        { documentUrl: fileUrl },
        { new: true }
      )
        .then(() => {
          res.status(200).json({
            success: true,
            message: 'Documento enviado com sucesso',
            url: fileUrl
          });
        })
        .catch(err => {
          console.error('Erro ao atualizar usuário com URL do documento:', err);
          res.status(500).json({
            success: false,
            message: 'Erro ao atualizar usuário com URL do documento'
          });
        });
    } else {
      // If no user is authenticated, just return the URL
      res.status(200).json({
        success: true,
        message: 'Documento enviado com sucesso (sem autenticação)',
        url: fileUrl
      });
    }
    */
    
  } catch (error) {
    console.error('Erro ao fazer upload do documento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer upload do documento',
      error: error.message
    });
  }
};