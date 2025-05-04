const multer = require('multer');
const path = require('path');

// Configuração de armazenamento (onde os arquivos serão salvos)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Especifica o diretório onde os arquivos serão salvos
    cb(null, path.join(__dirname, '../uploads/documents')); // Salva na pasta 'uploads/documents' na raiz do projeto
  },
  filename: function (req, file, cb) {
    // Define o nome do arquivo (você pode personalizar isso)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtro para garantir que apenas certos tipos de arquivos sejam aceitos (opcional)
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
    cb(null, true);
  } else {
    cb(null, false); // Rejeita outros tipos de arquivo
  }
};

// Inicializa o middleware de upload com as configurações
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 } // Limite de tamanho do arquivo (5MB neste exemplo)
});

module.exports = upload;