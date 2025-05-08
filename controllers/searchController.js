// searchController.js

const Event = require('../models/Event');
const Club = require('../models/Club');
const User = require('../models/User');


// Search for users by name or username
exports.searchUsers = async (req, res) => {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ success: false, message: 'Search query is required' });
      }
  
      // Create a case-insensitive regex for searching
      const searchRegex = new RegExp(query, 'i');
      
      // Search in name, surname, and username fields
      const users = await User.find({
        $or: [
          { name: searchRegex },
          { surname: searchRegex },
          { username: searchRegex }
        ]
      })
      .select('name surname username profilePicture') // Only return necessary fields
      .limit(5);
  
      return res.status(200).json({
        success: true,
        count: users.length,
        data: users
      });
    } catch (error) {
      console.error('Error searching users:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Server error while searching users',
        error: error.message
      });
    }
};
  
  // Search for events by name
exports.searchEvents = async (req, res) => {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ success: false, message: 'Search query is required' });
      }
  
      // Create a case-insensitive regex for searching
      const searchRegex = new RegExp(query, 'i');
      
      const events = await Event.find({ 
        name: searchRegex,
      }).limit(5);
  
      return res.status(200).json({
        success: true,
        count: events.length,
        data: events
      });
    } catch (error) {
      console.error('Error searching events:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Server error while searching events',
        error: error.message
      });
    }
};
  
  // Search for clubs by name
exports.searchClubs = async (req, res) => {
    try {
      const { query } = req.query;
      
      if (!query) {
        return res.status(400).json({ success: false, message: 'Search query is required' });
      }
  
      // Create a case-insensitive regex for searching
      const searchRegex = new RegExp(query, 'i');
      
      const clubs = await Club.find({ 
        name: searchRegex,
        deletedAt: null
      }).limit(5);
  
      return res.status(200).json({
        success: true,
        count: clubs.length,
        data: clubs
      });
    } catch (error) {
      console.error('Error searching clubs:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Server error while searching clubs',
        error: error.message
      });
    }
};
  
