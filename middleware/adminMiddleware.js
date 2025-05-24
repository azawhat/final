const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path based on your project structure

// Middleware to verify JWT token and check admin privileges
const adminAuth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Access denied. No token provided.' 
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Find user and check if they exist
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Access denied. User not found.' 
            });
        }

        // Check if user is admin
        if (!user.isAdmin) {
            return res.status(403).json({ 
                error: 'Access denied. Admin privileges required.' 
            });
        }

        // Check if user account is active (if you have this field)
        if (user.isDeleted || user.isBlocked) {
            return res.status(403).json({ 
                error: 'Access denied. Account is not active.' 
            });
        }

        // Add user to request object
        req.user = user;
        next();
        
    } catch (error) {
        console.error('Admin auth middleware error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                error: 'Access denied. Invalid token.' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                error: 'Access denied. Token expired.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Internal server error during authentication.' 
        });
    }
};

// Middleware to verify admin privileges only (assumes user is already authenticated)
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ 
                error: 'Authentication required.' 
            });
        }

        if (!req.user.isAdmin) {
            return res.status(403).json({ 
                error: 'Admin privileges required.' 
            });
        }

        next();
    } catch (error) {
        console.error('Require admin middleware error:', error);
        res.status(500).json({ 
            error: 'Internal server error during authorization.' 
        });
    }
};

// Middleware to log admin actions
const logAdminAction = (action) => {
    return (req, res, next) => {
        // Log admin action with timestamp, user info, and action
        console.log(`[${new Date().toISOString()}] ADMIN ACTION: ${action} by ${req.user?.email || 'Unknown'} (ID: ${req.user?._id || 'Unknown'})`);
        
        // You can also save this to a database if you want audit logs
        // AdminLog.create({
        //     adminId: req.user._id,
        //     action: action,
        //     timestamp: new Date(),
        //     ip: req.ip,
        //     userAgent: req.get('User-Agent')
        // });
        
        next();
    };
};

// Middleware to validate admin operations on resources
const validateResourceOwnership = (resourceType) => {
    return async (req, res, next) => {
        try {
            const { userId, eventId, clubId } = req.params;
            
            // For user operations
            if (resourceType === 'user' && userId) {
                const User = require('../models/User');
                const targetUser = await User.findById(userId);
                
                if (!targetUser) {
                    return res.status(404).json({ 
                        error: 'User not found.' 
                    });
                }
                
                // Prevent admin from deleting other admins (optional security measure)
                if (targetUser.isAdmin && targetUser._id.toString() !== req.user._id.toString()) {
                    return res.status(403).json({ 
                        error: 'Cannot perform operations on other admin accounts.' 
                    });
                }
                
                req.targetUser = targetUser;
            }
            
            // For event operations
            if (resourceType === 'event' && eventId) {
                const Event = require('../models/Event'); // Adjust path
                const event = await Event.findById(eventId).populate('creator');
                
                if (!event) {
                    return res.status(404).json({ 
                        error: 'Event not found.' 
                    });
                }
                
                req.targetEvent = event;
            }
            
            // For club operations
            if (resourceType === 'club' && clubId) {
                const Club = require('../models/Club'); // Adjust path
                const club = await Club.findById(clubId).populate('creator');
                
                if (!club) {
                    return res.status(404).json({ 
                        error: 'Club not found.' 
                    });
                }
                
                req.targetClub = club;
            }
            
            next();
        } catch (error) {
            console.error('Resource validation error:', error);
            res.status(500).json({ 
                error: 'Error validating resource.' 
            });
        }
    };
};

// Rate limiting middleware for admin actions (optional but recommended)
const adminRateLimit = () => {
    const attempts = new Map();
    const WINDOW_MS = 60 * 1000; // 1 minute
    const MAX_ATTEMPTS = 50; // Max 50 admin actions per minute per admin
    
    return (req, res, next) => {
        const adminId = req.user._id.toString();
        const now = Date.now();
        
        if (!attempts.has(adminId)) {
            attempts.set(adminId, []);
        }
        
        const userAttempts = attempts.get(adminId);
        
        // Remove old attempts outside the window
        const validAttempts = userAttempts.filter(timestamp => now - timestamp < WINDOW_MS);
        
        if (validAttempts.length >= MAX_ATTEMPTS) {
            return res.status(429).json({ 
                error: 'Too many admin actions. Please slow down.' 
            });
        }
        
        // Add current attempt
        validAttempts.push(now);
        attempts.set(adminId, validAttempts);
        
        next();
    };
};

module.exports = {
    adminAuth,
    requireAdmin,
    logAdminAction,
    validateResourceOwnership,
    adminRateLimit
};