const express = require('express');
const router = express.Router();
const Club = require('../models/Club');
const Event = require('../models/Event');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { sendQRCodeEmail } = require('../config/emailConfig');

const Application = require('../models/Application');

// Apply to a club
router.post('/club/:clubId', authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({ error: 'Invalid club ID' });
    }

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    if (club.isOpen) {
      return res.status(400).json({ 
        error: 'This club is open and does not require applications. You can join directly.' 
      });
    }

    if (club.creator._id.toString() === userId.toString()) {
      return res.status(400).json({ error: 'You cannot apply to your own club' });
    }

    const isParticipant = club.participants.some(
      participant => participant._id.toString() === userId.toString()
    );
    if (isParticipant) {
      return res.status(400).json({ error: 'You are already a member of this club' });
    }

    const existingApplication = await Application.findOne({
      applicant: userId,
      targetType: 'club',
      targetId: clubId
    });

    if (existingApplication) {
      return res.status(400).json({ error: 'You have already applied to this club' });
    }

    const application = new Application({
      applicant: userId,
      targetType: 'club',
      targetId: clubId
    });

    await application.save();

    res.status(201).json({ 
      message: 'Application submitted successfully',
      applicationId: application._id
    });

  } catch (error) {
    console.error('Error applying to club:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/event/:eventId', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.isOpen) {
      return res.status(400).json({ 
        error: 'This event is open and does not require applications. You can join directly.' 
      });
    }

    if (event.creator._id.toString() === userId.toString()) {
      return res.status(400).json({ error: 'You cannot apply to your own event' });
    }

    const isParticipant = event.participants.some(
      participant => participant._id.toString() === userId.toString()
    );
    if (isParticipant) {
      return res.status(400).json({ error: 'You are already a participant in this event' });
    }

    const existingApplication = await Application.findOne({
      applicant: userId,
      targetType: 'event',
      targetId: eventId
    });

    if (existingApplication) {
      return res.status(400).json({ error: 'You have already applied to this event' });
    }

    const application = new Application({
      applicant: userId,
      targetType: 'event',
      targetId: eventId
    });

    await application.save();

    res.status(201).json({ 
      message: 'Application submitted successfully',
      applicationId: application._id
    });

  } catch (error) {
    console.error('Error applying to event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/club/:clubId/applications', authMiddleware, async (req, res) => {
  try {
    const { clubId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      return res.status(400).json({ error: 'Invalid club ID' });
    }

    // Verify user is the club creator
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ error: 'Club not found' });
    }

    if (club.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only club creators can view applications' });
    }

    // Get applications for this club with applicant details
    const applications = await Application.find({
      targetType: 'club',
      targetId: clubId
    }).populate('applicant', 'name surname username email profilePicture').sort({ appliedAt: -1 });

    res.status(200).json(applications);

  } catch (error) {
    console.error('Error fetching club applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all applications for a specific event (for event creators)
router.get('/event/:eventId/applications', authMiddleware, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    // Verify user is the event creator
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only event creators can view applications' });
    }

    // Get applications for this event with applicant details
    const applications = await Application.find({
      targetType: 'event',
      targetId: eventId
    }).populate('applicant', 'name surname username email profilePicture').sort({ appliedAt: -1 });

    res.status(200).json(applications);

  } catch (error) {
    console.error('Error fetching event applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's own applications
router.get('/my-applications', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const applications = await Application.find({
      applicant: userId
    }).sort({ appliedAt: -1 });

    // Populate club and event details
    const populatedApplications = await Promise.all(
      applications.map(async (app) => {
        let targetDetails;
        if (app.targetType === 'club') {
          targetDetails = await Club.findById(app.targetId).select('name description category');
        } else {
          targetDetails = await Event.findById(app.targetId).select('name description category startDate location');
        }
        
        return {
          ...app.toObject(),
          targetDetails
        };
      })
    );

    res.status(200).json(populatedApplications);

  } catch (error) {
    console.error('Error fetching user applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept application
router.post('/accept/:applicationId', authMiddleware, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ error: 'Invalid application ID' });
    }

    const application = await Application.findById(applicationId).populate('applicant');
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Verify user is the creator of the club/event
    let target;
    if (application.targetType === 'club') {
      target = await Club.findById(application.targetId);
    } else {
      target = await Event.findById(application.targetId);
    }

    if (!target) {
      return res.status(404).json({ error: `${application.targetType} not found` });
    }

    if (target.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only creators can accept applications' });
    }

    const applicantUser = application.applicant;
    if (!applicantUser) {
      return res.status(404).json({ error: 'Applicant user not found' });
    }

    // Add user to participants
    const participantData = {
      _id: applicantUser._id,
      name: applicantUser.name,
      surname: applicantUser.surname,
      username: applicantUser.username,
    };

    if (application.targetType === 'club') {
      // For clubs: just add to participants and update user's joinedClubs
      target.participants.push(participantData);
      await target.save();
      await User.findByIdAndUpdate(application.applicant._id, { 
        $addToSet: { joinedClubs: application.targetId } 
      });
    } else {
      // For events: add to participants and send email with QR code
      target.participants.push(participantData);
      await target.save();

      // Generate QR code for the event
      try {
        const qrData = JSON.stringify({
          eventId: target._id.toString(),
          userId: applicantUser._id.toString(),
          eventName: target.name,
          userName: `${applicantUser.name} ${applicantUser.surname}`,
          timestamp: new Date().toISOString()
        });
        
        const qrCodeImage = await QRCode.toDataURL(qrData, {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          width: 256
        });

        // Send email with QR code
        const emailSent = await sendQRCodeEmail(applicantUser, target, qrCodeImage);
        if (!emailSent) {
          console.warn(`Failed to send QR code email to ${applicantUser.email} for event ${target.name}`);
        }
      } catch (qrError) {
        console.error('Error generating QR code:', qrError);
        // Continue with acceptance even if QR code generation fails
      }
    }

    // Delete the application after acceptance
    await Application.findByIdAndDelete(applicationId);

    const updatedApplications = await Application.find({
    targetType: application.targetType,
    targetId: application.targetId
    }).populate('applicant', 'name surname username email profilePicture').sort({ appliedAt: -1 });

    res.status(200).json({ 
    applications: updatedApplications
    });

  } catch (error) {
    console.error('Error accepting application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject application
router.post('/reject/:applicationId', authMiddleware, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({ error: 'Invalid application ID' });
    }

    const application = await Application.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Verify user is the creator of the club/event
    let target;
    if (application.targetType === 'club') {
      target = await Club.findById(application.targetId);
    } else {
      target = await Event.findById(application.targetId);
    }

    if (!target) {
      return res.status(404).json({ error: `${application.targetType} not found` });
    }

    if (target.creator._id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only creators can reject applications' });
    }

    // Delete the application (rejection means removal)
    await Application.findByIdAndDelete(applicationId);

    const updatedApplications = await Application.find({
    targetType: application.targetType,
    targetId: application.targetId
    }).populate('applicant', 'name surname username email profilePicture').sort({ appliedAt: -1 });

    res.status(200).json({ 
    applications: updatedApplications
    });

  } catch (error) {
    console.error('Error rejecting application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;