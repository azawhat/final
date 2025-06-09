const { sendNotificationToDevice, sendNotificationToMultipleDevices } = require('../config/firebaseConfig');
const { eventReminderQueue } = require('../config/queueConfig');
const User = require('../models/User');
const Event = require('../models/Event');

class NotificationService {
  /**
   * Schedule automatic event reminder notifications
   * @param {Object} event - Event object
   */
  static async scheduleEventReminders(event) {
    try {
      const eventStartTime = new Date(event.startDate);
      const now = new Date();

      // Time intervals for automatic reminders (in milliseconds)
      const reminderIntervals = [
        { hours: 24, delay: 24 * 60 * 60 * 1000 },
        { hours: 5, delay: 5 * 60 * 60 * 1000 },
        { minutes: 15, delay: 15 * 60 * 1000 }

      ];

      for (const interval of reminderIntervals) {
        const reminderTime = new Date(eventStartTime.getTime() - interval.delay);
        
        // Only schedule if reminder time is in the future
        if (reminderTime > now) {
          const delay = reminderTime.getTime() - now.getTime();
          
          const jobId = interval.hours 
            ? `${event._id}-${interval.hours}h`
            : `${event._id}-${interval.minutes}m`;

          await eventReminderQueue.add('send-event-reminder', {
            eventId: event._id,
            eventName: event.name,
            eventLocation: event.location,
            eventStartDate: event.startDate,
            reminderHours: interval.hours,
            reminderMinutes: interval.minutes
          }, {
            delay: delay,
            jobId: jobId,
            removeOnComplete: true,
            removeOnFail: false
          });

          const timeUnit = interval.hours ? `${interval.hours}h` : `${interval.minutes}m`;

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
      const jobIds = [`${eventId}-24h`, `${eventId}-5h`, `${eventId}-15m`];
      
      for (const jobId of jobIds) {
        const job = await eventReminderQueue.getJob(jobId);
        
        if (job) {
          await job.remove();
          console.log(`Cancelled reminder job ${jobId}`);
        }
      }
    } catch (error) {
      console.error('Error cancelling event reminders:', error);
    }
  }

  /**
   * Reschedule event reminders when event time is updated
   * @param {Object} event - Updated event object
   */
  static async rescheduleEventReminders(event) {
    try {
      // Cancel existing reminders
      await this.cancelEventReminders(event._id);
      
      // Schedule new reminders with updated time
      await this.scheduleEventReminders(event);
      
      console.log(`Rescheduled reminders for event ${event.name}`);
    } catch (error) {
      console.error('Error rescheduling event reminders:', error);
    }
  }

  /**
   * Process event reminder notification
   * @param {Object} jobData - Job data containing event information
   */
  static async processEventReminder(jobData) {
    try {
      const { eventId, eventName, eventLocation, reminderHours, reminderMinutes } = jobData;
      
      // Get event to verify it still exists and is active
      const event = await Event.findById(eventId).select('participants isOpen');
      
      if (!event) {
        console.log(`Event ${eventId} not found, skipping reminder`);
        return { success: false, error: 'Event not found' };
      }

      if (!event.isOpen) {
        console.log(`Event ${eventId} is closed, skipping reminder`);
        return { success: false, error: 'Event is closed' };
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
      
      // Create appropriate reminder message
      let timeText;
      if (reminderHours) {
        timeText = `${reminderHours} hour${reminderHours > 1 ? 's' : ''}`;
      } else {
        timeText = `${reminderMinutes} minute${reminderMinutes > 1 ? 's' : ''}`;
      }

      const notification = {
        notification: `⏰ Event Reminder - ${eventName}`,
        body: `${eventName} starts in ${timeText}${eventLocation ? ` at ${eventLocation}` : ''}`
      };

      const data = {
        title: `Event Reminder - ${eventName}`,
        message: `Your event ${eventName} starts in ${timeText}`
      };

      const result = await sendNotificationToMultipleDevices(tokens, notification, data);
      
      console.log(`Sent ${timeText} reminder for event ${eventName} to ${users.length} users`);
      return result;
    } catch (error) {
      console.error('Error processing event reminder:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification when user joins an event
   * @param {Object} event - Event object
   * @param {Object} user - User who joined
   */
  static async sendEventJoinNotification(event, user) {
    try {
      // Notify event creator
      const creator = await User.findById(event.creator._id);
      if (creator && creator.fcmToken && creator.notificationSettings.generalNotifications) {
        const notification = {
          title: `New Participant - ${event.name}`,
          body: `${user.name} ${user.surname} joined your event`
        };

        const data = {
          type: 'event_join',
          eventId: event._id.toString(),
          eventName: event.name,
          participantName: `${user.name} ${user.surname}`,
          timestamp: Date.now().toString()
        };

        await sendNotificationToDevice(creator.fcmToken, notification, data);
      }
    } catch (error) {
      console.error('Error sending event join notification:', error);
    }
  }

  /**
   * Send notification when event is cancelled
   * @param {Object} event - Cancelled event object
   */
  static async sendEventCancellationNotification(event) {
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
        title: `Event Cancelled - ${event.name}`,
        body: `Unfortunately, ${event.name} has been cancelled. We apologize for any inconvenience.`
      };

      const data = {
        type: 'event_cancelled',
        eventId: event._id.toString(),
        eventName: event.name,
        timestamp: Date.now().toString()
      };

      // Cancel scheduled reminders since event is cancelled
      await this.cancelEventReminders(event._id);

      return await sendNotificationToMultipleDevices(tokens, notification, data);
    } catch (error) {
      console.error('Error sending event cancellation notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;