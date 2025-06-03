const { sendNotificationToDevice, sendNotificationToMultipleDevices } = require('../config/firebaseConfig');
const { notificationQueue, eventReminderQueue } = require('../config/queueConfig');
const User = require('../models/User');
const Event = require('../models/Event');

class NotificationService {
  /**
   * Schedule event reminder notifications
   * @param {Object} event - Event object
   */
  static async scheduleEventReminders(event) {
    try {
      const eventStartTime = new Date(event.startDate);
      const now = new Date();

      // Time intervals for reminders (in milliseconds)
      const reminderIntervals = [
        { hours: 24, delay: 24 * 60 * 60 * 1000 },
        { hours: 12, delay: 12 * 60 * 60 * 1000 },
        { hours: 6, delay: 6 * 60 * 60 * 1000 },
        { hours: 1, delay: 1 * 60 * 60 * 1000 }
      ];

      for (const interval of reminderIntervals) {
        const reminderTime = new Date(eventStartTime.getTime() - interval.delay);
        
        // Only schedule if reminder time is in the future
        if (reminderTime > now) {
          const delay = reminderTime.getTime() - now.getTime();
          
          await eventReminderQueue.add('send-event-reminder', {
            eventId: event._id,
            eventName: event.name,
            eventLocation: event.location,
            eventStartDate: event.startDate,
            reminderHours: interval.hours
          }, {
            delay: delay,
            jobId: `${event._id}-${interval.hours}h`
          });

          console.log(`Scheduled ${interval.hours}h reminder for event ${event.name} at ${reminderTime}`);
        }
      }
    } catch (error) {
      console.error('Error scheduling event reminders:', error);
    }
  }

  /**
   * Cancel event reminders when event is deleted or updated
   * @param {string} eventId - Event ID
   */
  static async cancelEventReminders(eventId) {
    try {
      const reminderHours = [24, 12, 6, 1];
      
      for (const hours of reminderHours) {
        const jobId = `${eventId}-${hours}h`;
        const job = await eventReminderQueue.getJob(jobId);
        
        if (job) {
          await job.remove();
          console.log(`Cancelled ${hours}h reminder for event ${eventId}`);
        }
      }
    } catch (error) {
      console.error('Error cancelling event reminders:', error);
    }
  }

  /**
   * Send immediate notification
   * @param {string} userId - User ID
   * @param {Object} notification - Notification object
   * @param {Object} data - Additional data
   */
  static async sendImmediateNotification(userId, notification, data = {}) {
    try {
      const user = await User.findById(userId);
      
      if (!user || !user.fcmToken) {
        return { success: false, error: 'User not found or no FCM token' };
      }

      return await sendNotificationToDevice(user.fcmToken, notification, data);
    } catch (error) {
      console.error('Error sending immediate notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to multiple users
   * @param {Array} userIds - Array of user IDs
   * @param {Object} notification - Notification object
   * @param {Object} data - Additional data
   */
  static async sendNotificationToUsers(userIds, notification, data = {}) {
    try {
      const users = await User.find({ 
        _id: { $in: userIds },
        fcmToken: { $exists: true, $ne: null }
      });

      const tokens = users.map(user => user.fcmToken).filter(token => token);

      if (tokens.length === 0) {
        return { success: false, error: 'No valid FCM tokens found' };
      }

      return await sendNotificationToMultipleDevices(tokens, notification, data);
    } catch (error) {
      console.error('Error sending notification to users:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process event reminder notification
   * @param {Object} jobData - Job data containing event information
   */
  static async processEventReminder(jobData) {
    try {
      const { eventId, eventName, eventLocation, reminderHours } = jobData;
      
      // Get event participants
      const event = await Event.findById(eventId).select('participants');
      
      if (!event) {
        console.log(`Event ${eventId} not found, skipping reminder`);
        return { success: false, error: 'Event not found' };
      }

      // Get users with notification settings enabled
      const users = await User.find({
        _id: { $in: event.participants },
        fcmToken: { $exists: true, $ne: null },
        'notificationSettings.eventReminders': true
      });

      if (users.length === 0) {
        return { success: true, message: 'No users to notify' };
      }

      const tokens = users.map(user => user.fcmToken);
      
      const notification = {
        title: `Event Reminder - ${eventName}`,
        body: `${eventName} starts in ${reminderHours} hour${reminderHours > 1 ? 's' : ''} at ${eventLocation}`
      };

      const data = {
        type: 'event_reminder',
        eventId: eventId.toString(),
        eventName,
        eventLocation,
        reminderHours: reminderHours.toString()
      };

      const result = await sendNotificationToMultipleDevices(tokens, notification, data);
      
      console.log(`Sent ${reminderHours}h reminder for event ${eventName} to ${users.length} users`);
      return result;
    } catch (error) {
      console.error('Error processing event reminder:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send event update notification
   * @param {Object} event - Updated event object
   * @param {string} updateType - Type of update (e.g., 'updated', 'cancelled')
   */
  static async sendEventUpdateNotification(event, updateType = 'updated') {
    try {
      const users = await User.find({
        _id: { $in: event.participants },
        fcmToken: { $exists: true, $ne: null },
        'notificationSettings.eventReminders': true
      });

      if (users.length === 0) {
        return { success: true, message: 'No users to notify' };
      }

      const tokens = users.map(user => user.fcmToken);
      
      const notification = {
        title: `Event ${updateType.charAt(0).toUpperCase() + updateType.slice(1)}`,
        body: `${event.name} has been ${updateType}. Check the app for details.`
      };

      const data = {
        type: 'event_update',
        eventId: event._id.toString(),
        eventName: event.name,
        updateType
      };

      return await sendNotificationToMultipleDevices(tokens, notification, data);
    } catch (error) {
      console.error('Error sending event update notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add notification job to queue
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   * @param {Object} options - Queue options
   */
  static async addNotificationJob(type, data, options = {}) {
    try {
      const job = await notificationQueue.add(type, data, options);
      console.log(`Added notification job ${job.id} of type ${type}`);
      return job;
    } catch (error) {
      console.error('Error adding notification job:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;