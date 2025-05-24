const User = require('../models/User'); // Adjust paths based on your project structure
const Event = require('../models/Event');
const Club = require('../models/Club');

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
    try {
        const [totalUsers, totalEvents, totalClubs, verifiedUsers] = await Promise.all([
            User.countDocuments({ isDeleted: { $ne: true } }),
            Event.countDocuments({ isDeleted: { $ne: true } }),
            Club.countDocuments({ isDeleted: { $ne: true } }),
            User.countDocuments({ 
                isEmailVerified: true, 
                isDeleted: { $ne: true } 
            })
        ]);

        res.json({
            totalUsers,
            totalEvents,
            totalClubs,
            verifiedUsers,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch dashboard statistics' 
        });
    }
};

// Get all users with pagination and search
const getAllUsers = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            search = '', 
            verified = null,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { isDeleted: { $ne: true } };
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { surname: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (verified !== null) {
            query.isEmailVerified = verified === 'true';
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const users = await User.find(query)
            .select('-password -refreshToken')
            .sort(sortOptions)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const totalUsers = await User.countDocuments(query);

        res.json({
            users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalUsers / parseInt(limit)),
                totalUsers,
                hasNext: parseInt(page) * parseInt(limit) < totalUsers,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch users' 
        });
    }
};

// Get all events with pagination and search
const getAllEvents = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            search = '', 
            status = null,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { isDeleted: { $ne: true } };
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status !== null) {
            query.isOpen = status === 'open';
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const events = await Event.find(query)
            .populate('creator', 'name surname username email profilePicture')
            .sort(sortOptions)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const totalEvents = await Event.countDocuments(query);

        res.json({
            events,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalEvents / parseInt(limit)),
                totalEvents,
                hasNext: parseInt(page) * parseInt(limit) < totalEvents,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Get all events error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch events' 
        });
    }
};

// Get all clubs with pagination and search
const getAllClubs = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            search = '', 
            status = null,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { isDeleted: { $ne: true } };
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status !== null) {
            query.isOpen = status === 'open';
        }

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const clubs = await Club.find(query)
            .populate('creator', 'name surname username email profilePicture')
            .sort(sortOptions)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const totalClubs = await Club.countDocuments(query);

        res.json({
            clubs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalClubs / parseInt(limit)),
                totalClubs,
                hasNext: parseInt(page) * parseInt(limit) < totalClubs,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error('Get all clubs error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch clubs' 
        });
    }
};

// Delete user (admin only)
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found' 
            });
        }

        // Prevent deletion of other admins
        if (user.isAdmin && user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ 
                error: 'Cannot delete other admin accounts' 
            });
        }

        // Soft delete approach (recommended)
        await User.findByIdAndUpdate(userId, {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user._id
        });

        // Or hard delete (permanent)
        // await User.findByIdAndDelete(userId);

        // Also need to handle user's events and clubs
        await Event.updateMany(
            { creator: userId },
            { 
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user._id
            }
        );

        await Club.updateMany(
            { creator: userId },
            { 
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user._id
            }
        );

        res.json({ 
            message: 'User and associated content deleted successfully',
            deletedUser: {
                id: user._id,
                name: `${user.name} ${user.surname}`,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ 
            error: 'Failed to delete user' 
        });
    }
};

// Delete event (admin only)
const deleteEvent = async (req, res) => {
    try {
        const { eventId } = req.params;
        
        const event = await Event.findById(eventId).populate('creator', 'name surname email');
        if (!event) {
            return res.status(404).json({ 
                error: 'Event not found' 
            });
        }

        // Soft delete approach
        await Event.findByIdAndUpdate(eventId, {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user._id
        });

        // Or hard delete
        // await Event.findByIdAndDelete(eventId);

        res.json({ 
            message: 'Event deleted successfully',
            deletedEvent: {
                id: event._id,
                name: event.name,
                creator: event.creator
            }
        });

    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ 
            error: 'Failed to delete event' 
        });
    }
};

// Delete club (admin only)
const deleteClub = async (req, res) => {
    try {
        const { clubId } = req.params;
        
        const club = await Club.findById(clubId).populate('creator', 'name surname email');
        if (!club) {
            return res.status(404).json({ 
                error: 'Club not found' 
            });
        }

        // Soft delete approach
        await Club.findByIdAndUpdate(clubId, {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user._id
        });

        // Or hard delete
        // await Club.findByIdAndDelete(clubId);

        res.json({ 
            message: 'Club deleted successfully',
            deletedClub: {
                id: club._id,
                name: club.name,
                creator: club.creator
            }
        });

    } catch (error) {
        console.error('Delete club error:', error);
        res.status(500).json({ 
            error: 'Failed to delete club' 
        });
    }
};

// Toggle user verification status
const toggleUserVerification = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found' 
            });
        }

        user.isEmailVerified = !user.isEmailVerified;
        await user.save();

        res.json({ 
            message: `User verification ${user.isEmailVerified ? 'enabled' : 'disabled'}`,
            user: {
                id: user._id,
                name: `${user.name} ${user.surname}`,
                email: user.email,
                isEmailVerified: user.isEmailVerified
            }
        });

    } catch (error) {
        console.error('Toggle user verification error:', error);
        res.status(500).json({ 
            error: 'Failed to update user verification status' 
        });
    }
};

// Block/Unblock user
const toggleUserBlock = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found' 
            });
        }

        // Prevent blocking other admins
        if (user.isAdmin) {
            return res.status(403).json({ 
                error: 'Cannot block admin accounts' 
            });
        }

        user.isBlocked = !user.isBlocked;
        if (user.isBlocked) {
            user.blockedAt = new Date();
            user.blockedBy = req.user._id;
        } else {
            user.blockedAt = null;
            user.blockedBy = null;
        }
        
        await user.save();

        res.json({ 
            message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
            user: {
                id: user._id,
                name: `${user.name} ${user.surname}`,
                email: user.email,
                isBlocked: user.isBlocked
            }
        });

    } catch (error) {
        console.error('Toggle user block error:', error);
        res.status(500).json({ 
            error: 'Failed to update user block status' 
        });
    }
};

// Get user details
const getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId)
            .select('-password -refreshToken')
            .populate('createdEvents', 'name startDate location participants')
            .populate('createdClubs', 'name category participants')
            .lean();

        if (!user) {
            return res.status(404).json({ 
                error: 'User not found' 
            });
        }

        // Get additional stats
        const [eventsCreated, clubsCreated, eventsJoined, clubsJoined] = await Promise.all([
            Event.countDocuments({ creator: userId, isDeleted: { $ne: true } }),
            Club.countDocuments({ creator: userId, isDeleted: { $ne: true } }),
            Event.countDocuments({ participants: userId, isDeleted: { $ne: true } }),
            Club.countDocuments({ participants: userId, isDeleted: { $ne: true } })
        ]);

        const userDetails = {
            ...user,
            stats: {
                eventsCreated,
                clubsCreated,
                eventsJoined,
                clubsJoined
            }
        };

        res.json(userDetails);

    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch user details' 
        });
    }
};

module.exports = {
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
};