// Adicione este código no arquivo config/db.js ou onde você configura o MongoDB
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`MongoDB conectado: ${conn.connection.host}`);
    
    // Adicionar evento de erro na conexão
    mongoose.connection.on('error', (err) => {
      console.error('Erro de conexão MongoDB:', err);
      
      // Tentar reconectar
      if (err.name === 'MongoNetworkError' || 
          err.message.includes('connection closed') || 
          err.message.includes('pool cleared')) {
        console.log('Tentando reconectar ao MongoDB...');
        setTimeout(() => {
          mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
          }).catch(error => {
            console.error('Falha na tentativa de reconexão:', error);
          });
        }, 5000);
      }
    });
    
    // Adicionar evento de desconexão
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB desconectado. Tentando reconectar...');
      setTimeout(() => {
        mongoose.connect(process.env.MONGO_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        }).catch(error => {
          console.error('Falha na tentativa de reconexão:', error);
        });
      }, 5000);
    });
    
    return conn;
  } catch (error) {
    console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;