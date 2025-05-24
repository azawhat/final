const express = require('express');
const router = express.Router();
const path = require('path');

// Import middleware
const { 
    adminAuth, 
    logAdminAction, 
    validateResourceOwnership,
    adminRateLimit 
} = require('../middleware/adminMiddleware');

// Import controller
const {
    getDashboardStats,
    getAllUsers,
    getAllEvents,
    getAllClubs,
    deleteUser,
    deleteEvent,
    deleteClub,
    toggleUserVerification,
    toggleUserBlock,
    getUserDetails
} = require('../controllers/adminController');

// Serve admin dashboard HTML file
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/public/index.html'));
});

// Serve admin CSS (if separate)
router.get('/css/admin.css', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/public/css/admin.css'));
});

// Serve admin JS (if separate)
router.get('/js/admin.js', (req, res) => {
    res.sendFile(path.join(__dirname, '../admin/public/js/admin.js'));
});

// Apply admin authentication to all API routes
router.use('/api', adminAuth);
router.use('/api', adminRateLimit());

// Dashboard statistics
router.get('/api/stats', 
    logAdminAction('VIEW_DASHBOARD_STATS'),
    getDashboardStats
);

// User Management Routes
router.get('/api/users', 
    logAdminAction('VIEW_ALL_USERS'),
    getAllUsers
);

router.get('/api/users/:userId', 
    logAdminAction('VIEW_USER_DETAILS'),
    validateResourceOwnership('user'),
    getUserDetails
);

router.delete('/api/users/:userId', 
    logAdminAction('DELETE_USER'),
    validateResourceOwnership('user'),
    deleteUser
);

router.patch('/api/users/:userId/verify', 
    logAdminAction('TOGGLE_USER_VERIFICATION'),
    validateResourceOwnership('user'),
    toggleUserVerification
);

router.patch('/api/users/:userId/block', 
    logAdminAction('TOGGLE_USER_BLOCK'),
    validateResourceOwnership('user'),
    toggleUserBlock
);

// Event Management Routes
router.get('/api/events', 
    logAdminAction('VIEW_ALL_EVENTS'),
    getAllEvents
);

router.delete('/api/events/:eventId', 
    logAdminAction('DELETE_EVENT'),
    validateResourceOwnership('event'),
    deleteEvent
);

// Club Management Routes
router.get('/api/clubs', 
    logAdminAction('VIEW_ALL_CLUBS'),
    getAllClubs
);

router.delete('/api/clubs/:clubId', 
    logAdminAction('DELETE_CLUB'),
    validateResourceOwnership('club'),
    deleteClub
);

// Bulk Operations (Optional advanced features)
router.post('/api/bulk/delete-users', 
    logAdminAction('BULK_DELETE_USERS'),
    async (req, res) => {
        try {
            const { userIds } = req.body;
            
            if (!Array.isArray(userIds) || userIds.length === 0) {
                return res.status(400).json({ 
                    error: 'Invalid user IDs provided' 
                });
            }

            // Prevent deletion of admin accounts
            const User = require('../models/User');
            const admins = await User.find({ 
                _id: { $in: userIds }, 
                isAdmin: true 
            });

            if (admins.length > 0) {
                return res.status(403).json({ 
                    error: 'Cannot delete admin accounts in bulk operation' 
                });
            }

            const result = await User.updateMany(
                { _id: { $in: userIds } },
                { 
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: req.user._id
                }
            );

            res.json({ 
                message: `${result.modifiedCount} users deleted successfully`,
                deletedCount: result.modifiedCount
            });

        } catch (error) {
            console.error('Bulk delete users error:', error);
            res.status(500).json({ 
                error: 'Failed to delete users' 
            });
        }
    }
);

router.post('/api/bulk/delete-events', 
    logAdminAction('BULK_DELETE_EVENTS'),
    async (req, res) => {
        try {
            const { eventIds } = req.body;
            
            if (!Array.isArray(eventIds) || eventIds.length === 0) {
                return res.status(400).json({ 
                    error: 'Invalid event IDs provided' 
                });
            }

            const Event = require('../models/Event');
            const result = await Event.updateMany(
                { _id: { $in: eventIds } },
                { 
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: req.user._id
                }
            );

            res.json({ 
                message: `${result.modifiedCount} events deleted successfully`,
                deletedCount: result.modifiedCount
            });

        } catch (error) {
            console.error('Bulk delete events error:', error);
            res.status(500).json({ 
                error: 'Failed to delete events' 
            });
        }
    }
);

router.post('/api/bulk/delete-clubs', 
    logAdminAction('BULK_DELETE_CLUBS'),
    async (req, res) => {
        try {
            const { clubIds } = req.body;
            
            if (!Array.isArray(clubIds) || clubIds.length === 0) {
                return res.status(400).json({ 
                    error: 'Invalid club IDs provided' 
                });
            }

            const Club = require('../models/Club');
            const result = await Club.updateMany(
                { _id: { $in: clubIds } },
                { 
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: req.user._id
                }
            );

            res.json({ 
                message: `${result.modifiedCount} clubs deleted successfully`,
                deletedCount: result.modifiedCount
            });

        } catch (error) {
            console.error('Bulk delete clubs error:', error);
            res.status(500).json({ 
                error: 'Failed to delete clubs' 
            });
        }
    }
);

// Export data (Optional feature)
router.get('/api/export/users', 
    logAdminAction('EXPORT_USERS_DATA'),
    async (req, res) => {
        try {
            const User = require('../models/User');
            const users = await User.find({ isDeleted: { $ne: true } })
                .select('-password -refreshToken')
                .lean();

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=users-export.json');
            res.json(users);

        } catch (error) {
            console.error('Export users error:', error);
            res.status(500).json({ 
                error: 'Failed to export users data' 
            });
        }
    }
);

router.get('/api/export/events', 
    logAdminAction('EXPORT_EVENTS_DATA'),
    async (req, res) => {
        try {
            const Event = require('../models/Event');
            const events = await Event.find({ isDeleted: { $ne: true } })
                .populate('creator', 'name surname email')
                .lean();

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=events-export.json');
            res.json(events);

        } catch (error) {
            console.error('Export events error:', error);
            res.status(500).json({ 
                error: 'Failed to export events data' 
            });
        }
    }
);

router.get('/api/export/clubs', 
    logAdminAction('EXPORT_CLUBS_DATA'),
    async (req, res) => {
        try {
            const Club = require('../models/Club');
            const clubs = await Club.find({ isDeleted: { $ne: true } })
                .populate('creator', 'name surname email')
                .lean();

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=clubs-export.json');
            res.json(clubs);

        } catch (error) {
            console.error('Export clubs error:', error);
            res.status(500).json({ 
                error: 'Failed to export clubs data' 
            });
        }
    }
);

// Admin activity logs (Optional feature)
router.get('/api/activity-logs', 
    logAdminAction('VIEW_ACTIVITY_LOGS'),
    async (req, res) => {
        try {
            const { page = 1, limit = 50, adminId = null } = req.query;
            
            // This would require an AdminLog model if you want to store logs in DB
            // For now, we'll return a placeholder response
            res.json({
                message: 'Activity logs feature - implement AdminLog model for persistent logging',
                logs: [],
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: 0,
                    totalLogs: 0
                }
            });

        } catch (error) {
            console.error('Get activity logs error:', error);
            res.status(500).json({ 
                error: 'Failed to fetch activity logs' 
            });
        }
    }
);

// System health check
router.get('/api/health', 
    logAdminAction('SYSTEM_HEALTH_CHECK'),
    async (req, res) => {
        try {
            const mongoose = require('mongoose');
            
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                database: {
                    status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
                    readyState: mongoose.connection.readyState
                },
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                },
                uptime: Math.round(process.uptime())
            };

            res.json(health);

        } catch (error) {
            console.error('Health check error:', error);
            res.status(500).json({ 
                error: 'Health check failed',
                status: 'unhealthy'
            });
        }
    }
);

module.exports = router;