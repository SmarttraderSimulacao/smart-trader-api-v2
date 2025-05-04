const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Por favor, informe um nome de usuário'],
    unique: true,
    trim: true,
    maxlength: [50, 'Nome de usuário não pode ter mais de 50 caracteres']
  },
  email: {
    type: String,
    required: [true, 'Por favor, informe um email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Por favor, informe um email válido'
    ]
  },
  password: {
    type: String,
    required: [true, 'Por favor, informe uma senha'],
    minlength: 6,
    select: false // Não retorna a senha nas consultas
  },
  pixKey: {
    type: String,
    default: ''
  },
  balance: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  paymentHistory: [{
    amount: Number,
    date: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['deposit', 'withdrawal', 'prize', 'entry_fee'],
    },
    description: String,
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room'
    },
    receiptUrl: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Criptografar senha antes de salvar
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método para verificar senha
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);