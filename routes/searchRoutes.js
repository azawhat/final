const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

router.get('/events', searchController.searchEvents);

router.get('/clubs', searchController.searchClubs);

router.get('/users', searchController.searchUsers);

module.exports = router;