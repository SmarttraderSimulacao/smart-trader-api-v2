const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const { protect } = require('../middleware/auth');

// Routes for rooms
router.get('/rooms', protect, roomController.getAllRooms);
router.get('/rooms/:id', protect, roomController.getRoomDetails);
router.post('/rooms/:id/join', protect, roomController.joinRoom);
router.post('/rooms', protect, roomController.createRoom);
router.put('/rooms/:id/status', protect, roomController.updateRoomStatus);

module.exports = router;