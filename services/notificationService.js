// Enhanced NotificationService with comprehensive debugging
const { sendNotificationToDevice, sendNotificationToMultipleDevices } = require('../config/firebaseConfig');
const { eventReminderQueue } = require('../config/queueConfig');
const User = require('../models/User');
const Event = require('../models/Event');

class NotificationService {
  /**
   * Schedule automatic event reminder notifications with enhanced debugging
   * @param {Object} event - Event object
   */
  static async scheduleEventReminders(event) {
    try {
      console.log(`🔔 Starting to schedule reminders for event: ${event.name} (ID: ${event._id})`);
      
      const eventStartTime = new Date(event.startDate);
      const now = new Date();
      
      console.log(`📅 Event start time: ${eventStartTime.toISOString()}`);
      console.log(`⏰ Current time: ${now.toISOString()}`);
      console.log(`⏳ Time until event: ${Math.round((eventStartTime - now) / (1000 * 60 * 60))} hours`);

      // Time intervals for automatic reminders (in milliseconds)
      const reminderIntervals = [
        { hours: 24, delay: 24 * 60 * 60 * 1000 },
        { hours: 5, delay: 5 * 60 * 60 * 1000 },
        { minutes: 15, delay: 15 * 60 * 1000 }
      ];

      let scheduledCount = 0;
      
      for (const interval of reminderIntervals) {
        const reminderTime = new Date(eventStartTime.getTime() - interval.delay);
        
        console.log(`\n📋 Processing ${interval.hours ? interval.hours + 'h' : interval.minutes + 'm'} reminder:`);
        console.log(`   Reminder time: ${reminderTime.toISOString()}`);
        console.log(`   Is future: ${reminderTime > now}`);
        
        // Only schedule if reminder time is in the future
        if (reminderTime > now) {
          const delay = reminderTime.getTime() - now.getTime();
          
          const jobId = interval.hours 
            ? `${event._id}-${interval.hours}h`
            : `${event._id}-${interval.minutes}m`;

          console.log(`   ⏱️ Scheduling job ${jobId} with ${Math.round(delay / 1000)} seconds delay`);
          console.log(`   📍 Will execute at: ${new Date(now.getTime() + delay).toISOString()}`);

          const job = await eventReminderQueue.add('send-event-reminder', {
            eventId: event._id,
            eventName: event.name,
            eventLocation: event.location,
            eventStartDate: event.startDate,
            reminderHours: interval.hours,
            reminderMinutes: interval.minutes,
            scheduledAt: now.toISOString(),
            reminderTime: reminderTime.toISOString()
          }, {
            delay: delay,
            jobId: jobId,
            removeOnComplete: true,
            removeOnFail: false,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            }
          });

          console.log(`   ✅ Job scheduled successfully: ${job.id}`);
          scheduledCount++;
        } else {
          console.log(`   ⏭️ Skipping - reminder time is in the past`);
        }
      }
      
      console.log(`\n🎯 Successfully scheduled ${scheduledCount} reminders for event: ${event.name}`);
      
      // Verify jobs were added to queue
      await this.verifyScheduledJobs(event._id);
      
    } catch (error) {
      console.error('❌ Error scheduling event reminders:', error);
      throw error;
    }
  }

  /**
   * Verify that jobs were actually scheduled in the queue
   */
  static async verifyScheduledJobs(eventId) {
    try {
      console.log(`\n🔍 Verifying scheduled jobs for event ${eventId}:`);
      
      const jobIds = [`${eventId}-24h`, `${eventId}-5h`, `${eventId}-15m`];
      
      for (const jobId of jobIds) {
        const job = await eventReminderQueue.getJob(jobId);
        if (job) {
          const delay = job.opts.delay;
          const executeAt = new Date(job.processedOn + delay);
          console.log(`   ✅ Job ${jobId} found - executes at: ${executeAt.toISOString()}`);
        } else {
          console.log(`   ❌ Job ${jobId} NOT found in queue`);
        }
      }
      
      // Also check waiting jobs
      const waiting = await eventReminderQueue.getWaiting();
      console.log(`\n📊 Queue status: ${waiting.length} waiting jobs`);
      
      const eventJobs = waiting.filter(job => 
        job.data.eventId && job.data.eventId.toString() === eventId.toString()
      );
      console.log(`📊 Event-specific jobs in queue: ${eventJobs.length}`);
      
    } catch (error) {
      console.error('Error verifying scheduled jobs:', error);
    }
  }

  /**
   * Enhanced event reminder processing with detailed logging
   */
  static async processEventReminder(jobData) {
    try {
      console.log(`\n🚀 Processing event reminder job:`);
      console.log(`   Event: ${jobData.eventName} (${jobData.eventId})`);
      console.log(`   Reminder: ${jobData.reminderHours ? jobData.reminderHours + 'h' : jobData.reminderMinutes + 'm'}`);
      console.log(`   Scheduled at: ${jobData.scheduledAt}`);
      console.log(`   Should remind at: ${jobData.reminderTime}`);
      console.log(`   Processing at: ${new Date().toISOString()}`);
      
      const { eventId, eventName, eventLocation, reminderHours, reminderMinutes } = jobData;
      
      // Get event to verify it still exists and is active
      const event = await Event.findById(eventId).populate('participants', 'name surname fcmToken notificationSettings');
      
      if (!event) {
        console.log(`❌ Event ${eventId} not found, skipping reminder`);
        return { success: false, error: 'Event not found' };
      }

      console.log(`📋 Event found: ${event.name}`);
      console.log(`📋 Event isOpen: ${event.isOpen}`);
      console.log(`📋 Event participants: ${event.participants.length}`);

      if (event.isOpen === false) {
        console.log(`⚠️ Event ${eventId} is closed, skipping reminder`);
        return { success: false, error: 'Event is closed' };
      }

      // Get users with notification settings enabled
      const eligibleUsers = event.participants.filter(participant => {
        const hasToken = participant.fcmToken && participant.fcmToken.trim() !== '';
        const hasSettings = participant.notificationSettings && participant.notificationSettings.eventReminders;
        
        console.log(`👤 User ${participant.name}: token=${!!hasToken}, settings=${!!hasSettings}`);
        
        return hasToken && hasSettings;
      });

      console.log(`📱 Eligible users for notification: ${eligibleUsers.length}`);

      if (eligibleUsers.length === 0) {
        console.log(`⚠️ No eligible users to notify for event ${eventName}`);
        return { success: true, message: 'No users to notify' };
      }

      const tokens = eligibleUsers.map(user => user.fcmToken);
      console.log(`📤 Sending to ${tokens.length} FCM tokens`);
      
      // Create appropriate reminder message
      let timeText;
      if (reminderHours) {
        timeText = `${reminderHours} hour${reminderHours > 1 ? 's' : ''}`;
      } else {
        timeText = `${reminderMinutes} minute${reminderMinutes > 1 ? 's' : ''}`;
      }

      const notification = {
        title: `⏰ Event Reminder - ${eventName}`,
        body: `${eventName} starts in ${timeText}${eventLocation ? ` at ${eventLocation}` : ''}`
      };

      const data = {
        type: 'event_reminder',
        eventId: eventId.toString(),
        eventName,
        eventLocation: eventLocation || '',
        reminderTime: reminderHours ? `${reminderHours}h` : `${reminderMinutes}m`,
        timestamp: Date.now().toString()
      };

      console.log(`📧 Notification details:`);
      console.log(`   Title: ${notification.title}`);
      console.log(`   Body: ${notification.body}`);
      console.log(`   Data: ${JSON.stringify(data, null, 2)}`);

      const result = await sendNotificationToMultipleDevices(tokens, notification, data);
      
      console.log(`📊 Notification result:`, result);
      
      if (result.success) {
        console.log(`✅ Successfully sent ${timeText} reminder for event ${eventName} to ${eligibleUsers.length} users`);
        console.log(`📈 Success count: ${result.successCount}, Failure count: ${result.failureCount}`);
      } else {
        console.log(`❌ Failed to send reminder: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error processing event reminder:', error);
      console.error('Stack trace:', error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel event reminders when event is deleted or updated
   */
  static async cancelEventReminders(eventId) {
    try {
      console.log(`🗑️ Cancelling reminders for event ${eventId}`);
      
      const jobIds = [`${eventId}-24h`, `${eventId}-5h`, `${eventId}-15m`];
      let cancelledCount = 0;
      
      for (const jobId of jobIds) {
        const job = await eventReminderQueue.getJob(jobId);
        
        if (job) {
          await job.remove();
          console.log(`✅ Cancelled reminder job ${jobId}`);
          cancelledCount++;
        } else {
          console.log(`⚠️ Job ${jobId} not found (may have already been processed)`);
        }
      }
      
      console.log(`🎯 Cancelled ${cancelledCount} reminder jobs for event ${eventId}`);
    } catch (error) {
      console.error('❌ Error cancelling event reminders:', error);
      throw error;
    }
  }

  /**
   * Get detailed queue statistics
   */
  static async getQueueStats() {
    try {
      const waiting = await eventReminderQueue.getWaiting();
      const active = await eventReminderQueue.getActive();
      const completed = await eventReminderQueue.getCompleted();
      const failed = await eventReminderQueue.getFailed();

      console.log(`\n📊 Queue Statistics:`);
      console.log(`   Waiting: ${waiting.length}`);
      console.log(`   Active: ${active.length}`);
      console.log(`   Completed: ${completed.length}`);
      console.log(`   Failed: ${failed.length}`);

      // Log details of waiting jobs
      if (waiting.length > 0) {
        console.log(`\n⏳ Waiting Jobs:`);
        waiting.forEach((job, index) => {
          const executeAt = new Date(job.processedOn + job.opts.delay);
          console.log(`   ${index + 1}. ${job.id} - ${job.data.eventName} - executes at: ${executeAt.toISOString()}`);
        });
      }

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        waitingJobs: waiting.map(job => ({
          id: job.id,
          eventName: job.data.eventName,
          reminderTime: job.data.reminderHours ? `${job.data.reminderHours}h` : `${job.data.reminderMinutes}m`,
          executeAt: new Date(job.processedOn + job.opts.delay)
        }))
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Test notification system
   */
  static async testNotificationSystem(userId) {
    try {
      console.log(`\n🧪 Testing notification system for user ${userId}`);
      
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      console.log(`👤 User: ${user.name} ${user.surname}`);
      console.log(`📱 FCM Token: ${user.fcmToken ? user.fcmToken.substring(0, 20) + '...' : 'NOT SET'}`);
      console.log(`⚙️ Notification Settings:`, user.notificationSettings);

      if (!user.fcmToken) {
        throw new Error('User has no FCM token');
      }

      const notification = {
        title: '🧪 Test Notification',
        body: 'This is a test notification from the enhanced debugging system'
      };

      const data = {
        type: 'test',
        timestamp: Date.now().toString()
      };

      console.log(`📤 Sending test notification...`);
      const result = await sendNotificationToDevice(user.fcmToken, notification, data);
      
      console.log(`📊 Test result:`, result);
      
      return result;
    } catch (error) {
      console.error('❌ Error testing notification system:', error);
      throw error;
    }
  }

  // Keep other existing methods unchanged
  static async rescheduleEventReminders(event) {
    try {
      await this.cancelEventReminders(event._id);
      await this.scheduleEventReminders(event);
      console.log(`🔄 Rescheduled reminders for event ${event.name}`);
    } catch (error) {
      console.error('Error rescheduling event reminders:', error);
      throw error;
    }
  }

  static async sendEventJoinNotification(event, user) {
    try {
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

      await this.cancelEventReminders(event._id);
      return await sendNotificationToMultipleDevices(tokens, notification, data);
    } catch (error) {
      console.error('Error sending event cancellation notification:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService;