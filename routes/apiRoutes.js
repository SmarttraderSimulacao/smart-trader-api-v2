const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const upload = require('../middleware/upload');

// Only auth routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Document upload route
router.post('/auth/upload-document', upload.single('document'), (req, res) => {
  authController.uploadDocument(req, res);
});

// Simple test routes
router.get('/test-connection', (req, res) => {
  res.json({ message: 'Conexão bem-sucedida!' });
});

router.get('/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;