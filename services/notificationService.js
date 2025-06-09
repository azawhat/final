// Enhanced NotificationService with proper date parsing and fixed reminder scheduling
const { sendNotificationToDevice, sendNotificationToMultipleDevices } = require('../config/firebaseConfig');
const { eventReminderQueue } = require('../config/queueConfig');
const User = require('../models/User');
const Event = require('../models/Event');

class NotificationService {
  /**
   * Parse and validate date string
   * @param {string|Date} dateInput - Date string or Date object
   * @returns {Date} Parsed Date object
   */
  static parseEventDate(dateInput) {
    try {
      console.log(`📅 Parsing date input:`, dateInput, typeof dateInput);
      
      if (dateInput instanceof Date) {
        return dateInput;
      }
      
      if (typeof dateInput === 'string') {
        // Handle the specific format "2025-06-10T03:54"
        // Add seconds and timezone if missing for proper ISO format
        let isoString = dateInput;
        
        // Check if it's in format "YYYY-MM-DDTHH:mm" (missing seconds)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateInput)) {
          isoString = `${dateInput}:00.000Z`; // Add seconds, milliseconds, and UTC timezone
          console.log(`🔧 Converted to ISO format: ${isoString}`);
        }
        // Check if it's missing timezone info
        else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateInput)) {
          isoString = `${dateInput}.000Z`; // Add timezone
          console.log(`🔧 Added timezone: ${isoString}`);
        }
        
        const parsedDate = new Date(isoString);
        
        if (isNaN(parsedDate.getTime())) {
          throw new Error(`Invalid date string: ${dateInput}`);
        }
        
        console.log(`✅ Successfully parsed date: ${parsedDate.toISOString()}`);
        return parsedDate;
      }
      
      throw new Error(`Invalid date input type: ${typeof dateInput}`);
    } catch (error) {
      console.error(`❌ Date parsing error:`, error);
      throw new Error(`Failed to parse date: ${dateInput} - ${error.message}`);
    }
  }

  /**
   * Parse notification data based on type
   * @param {Object} notificationData - Raw notification data from FCM
   * @returns {Object} Parsed notification object
   */
  static parseNotificationData(notificationData) {
    try {
      console.log(`📱 Parsing notification data:`, notificationData);
      
      const { data, notification } = notificationData;
      
      if (!data || !data.type) {
        console.log(`⚠️ No data or type found in notification`);
        return {
          type: 'unknown',
          title: notification?.title || 'Notification',
          body: notification?.body || '',
          parsedData: {}
        };
      }

      const baseData = {
        type: data.type,
        title: notification?.title || 'Notification',
        body: notification?.body || '',
        timestamp: data.timestamp ? parseInt(data.timestamp) : Date.now(),
        rawData: data
      };

      console.log(`🔍 Notification type: ${data.type}`);

      switch (data.type) {
        case 'event_reminder':
          return this.parseEventReminderData(baseData, data);
        
        case 'event_join':
          return this.parseEventJoinData(baseData, data);
        
        case 'event_cancelled':
          return this.parseEventCancelledData(baseData, data);
        
        case 'event_updated':
          return this.parseEventUpdatedData(baseData, data);
        
        case 'test':
          return this.parseTestNotificationData(baseData, data);
        
        default:
          console.log(`⚠️ Unknown notification type: ${data.type}`);
          return {
            ...baseData,
            parsedData: data
          };
      }
    } catch (error) {
      console.error('❌ Error parsing notification data:', error);
      return {
        type: 'error',
        title: 'Notification Error',
        body: 'Failed to parse notification data',
        error: error.message,
        parsedData: {}
      };
    }
  }

  /**
   * Parse event reminder notification data
   */
  static parseEventReminderData(baseData, data) {
    console.log(`⏰ Parsing event reminder data`);
    
    return {
      ...baseData,
      parsedData: {
        eventId: data.eventId,
        eventName: data.eventName,
        eventLocation: data.eventLocation,
        reminderTime: data.reminderTime,
        isReminder: true,
        actionType: 'view_event',
        // Parse reminder time for display
        reminderDisplay: this.formatReminderTime(data.reminderTime),
        // Calculate event start time if available - with proper parsing
        eventStartTime: data.eventStartDate ? this.parseEventDate(data.eventStartDate) : null
      }
    };
  }

  /**
   * Parse event join notification data
   */
  static parseEventJoinData(baseData, data) {
    console.log(`👥 Parsing event join data`);
    
    return {
      ...baseData,
      parsedData: {
        eventId: data.eventId,
        eventName: data.eventName,
        participantName: data.participantName,
        actionType: 'view_event_participants',
        isJoinNotification: true
      }
    };
  }

  /**
   * Parse event cancelled notification data
   */
  static parseEventCancelledData(baseData, data) {
    console.log(`❌ Parsing event cancelled data`);
    
    return {
      ...baseData,
      parsedData: {
        eventId: data.eventId,
        eventName: data.eventName,
        actionType: 'view_cancelled_event',
        isCancellation: true,
        shouldRemoveFromList: true
      }
    };
  }

  /**
   * Parse event updated notification data
   */
  static parseEventUpdatedData(baseData, data) {
    console.log(`📝 Parsing event updated data`);
    
    return {
      ...baseData,
      parsedData: {
        eventId: data.eventId,
        eventName: data.eventName,
        updatedFields: data.updatedFields ? JSON.parse(data.updatedFields) : [],
        actionType: 'view_event',
        isUpdate: true,
        isCriticalUpdate: this.isCriticalEventUpdate(data.updatedFields)
      }
    };
  }

  /**
   * Parse test notification data
   */
  static parseTestNotificationData(baseData, data) {
    console.log(`🧪 Parsing test notification data`);
    
    return {
      ...baseData,
      parsedData: {
        isTest: true,
        actionType: 'none',
        testTimestamp: data.timestamp
      }
    };
  }

  /**
   * Format reminder time for display
   */
  static formatReminderTime(reminderTime) {
    if (!reminderTime) return 'Unknown';
    
    if (reminderTime.includes('h')) {
      const hours = reminderTime.replace('h', '');
      return `${hours} hour${hours !== '1' ? 's' : ''} before`;
    } else if (reminderTime.includes('m')) {
      const minutes = reminderTime.replace('m', '');
      return `${minutes} minute${minutes !== '1' ? 's' : ''} before`;
    }
    
    return reminderTime;
  }

  /**
   * Check if event update is critical (requires immediate attention)
   */
  static isCriticalEventUpdate(updatedFieldsJson) {
    if (!updatedFieldsJson) return false;
    
    try {
      const updatedFields = JSON.parse(updatedFieldsJson);
      const criticalFields = ['startDate', 'endDate', 'location', 'name'];
      
      return criticalFields.some(field => updatedFields.includes(field));
    } catch (error) {
      console.error('Error parsing updated fields:', error);
      return false;
    }
  }

  /**
   * Handle notification tap/click action
   */
  static handleNotificationAction(parsedNotification, navigationCallback) {
    try {
      console.log(`🔔 Handling notification action:`, parsedNotification);
      
      const { parsedData } = parsedNotification;
      
      switch (parsedData.actionType) {
        case 'view_event':
          if (parsedData.eventId) {
            console.log(`📍 Navigating to event: ${parsedData.eventId}`);
            navigationCallback('EventDetails', { eventId: parsedData.eventId });
          }
          break;
          
        case 'view_event_participants':
          if (parsedData.eventId) {
            console.log(`👥 Navigating to event participants: ${parsedData.eventId}`);
            navigationCallback('EventParticipants', { eventId: parsedData.eventId });
          }
          break;
          
        case 'view_cancelled_event':
          console.log(`❌ Showing cancelled event info`);
          navigationCallback('CancelledEventInfo', { 
            eventId: parsedData.eventId,
            eventName: parsedData.eventName 
          });
          break;
          
        case 'none':
          console.log(`🚫 No action required for this notification`);
          break;
          
        default:
          console.log(`⚠️ Unknown action type: ${parsedData.actionType}`);
          break;
      }
    } catch (error) {
      console.error('❌ Error handling notification action:', error);
    }
  }

  /**
   * Get notification display configuration
   */
  static getNotificationDisplayConfig(parsedNotification) {
    const { type, parsedData } = parsedNotification;
    
    const config = {
      showBadge: true,
      playSound: true,
      showAlert: true,
      priority: 'normal'
    };
    
    switch (type) {
      case 'event_reminder':
        // Higher priority for imminent reminders
        if (parsedData.reminderTime === '15m') {
          config.priority = 'high';
          config.playSound = true;
        } else if (parsedData.reminderTime === '5h') {
          config.priority = 'normal';
        } else {
          config.priority = 'low';
        }
        break;
        
      case 'event_cancelled':
        config.priority = 'high';
        config.playSound = true;
        break;
        
      case 'event_join':
        config.priority = 'low';
        config.playSound = false;
        break;
        
      case 'event_updated':
        config.priority = parsedData.isCriticalUpdate ? 'high' : 'normal';
        config.playSound = parsedData.isCriticalUpdate;
        break;
        
      case 'test':
        config.priority = 'low';
        break;
        
      default:
        break;
    }
    
    return config;
  }

  /**
   * Create notification history entry
   */
  static async createNotificationHistory(userId, parsedNotification) {
    try {
      const historyEntry = {
        userId,
        type: parsedNotification.type,
        title: parsedNotification.title,
        body: parsedNotification.body,
        data: parsedNotification.parsedData,
        timestamp: new Date(parsedNotification.timestamp),
        read: false,
        actionTaken: false
      };
      
      console.log(`📝 Creating notification history entry:`, historyEntry);
      
      // Here you would save to your notification history collection
      // const NotificationHistory = require('../models/NotificationHistory');
      // await NotificationHistory.create(historyEntry);
      
      return historyEntry;
    } catch (error) {
      console.error('❌ Error creating notification history:', error);
      throw error;
    }
  }

  /**
   * Schedule ONLY the required event reminder notifications (24h, 5h, 15m)
   * with enhanced date parsing and debugging
   * @param {Object} event - Event object
   */
  static async scheduleEventReminders(event) {
    try {
      console.log(`🔔 Starting to schedule reminders for event: ${event.name} (ID: ${event._id})`);
      console.log(`📅 Raw startDate:`, event.startDate, typeof event.startDate);
      
      // Parse the event start date properly
      const eventStartTime = this.parseEventDate(event.startDate);
      const now = new Date();
      
      console.log(`📅 Parsed event start time: ${eventStartTime.toISOString()}`);
      console.log(`⏰ Current time: ${now.toISOString()}`);
      console.log(`⏳ Time until event: ${Math.round((eventStartTime - now) / (1000 * 60 * 60))} hours`);

      // ONLY the 3 required reminder intervals
      const reminderIntervals = [
        { hours: 24, delay: 24 * 60 * 60 * 1000, label: '24h' },
        { hours: 5, delay: 5 * 60 * 60 * 1000, label: '5h' },
        { minutes: 15, delay: 15 * 60 * 1000, label: '15m' }
      ];

      let scheduledCount = 0;
      
      for (const interval of reminderIntervals) {
        const reminderTime = new Date(eventStartTime.getTime() - interval.delay);
        
        console.log(`\n📋 Processing ${interval.label} reminder:`);
        console.log(`   Reminder time: ${reminderTime.toISOString()}`);
        console.log(`   Is future: ${reminderTime > now}`);
        
        // Only schedule if reminder time is in the future
        if (reminderTime > now) {
          const delay = reminderTime.getTime() - now.getTime();
          
          const jobId = `${event._id}-${interval.label}`;

          console.log(`   ⏱️ Scheduling job ${jobId} with ${Math.round(delay / 1000)} seconds delay`);
          console.log(`   📍 Will execute at: ${new Date(now.getTime() + delay).toISOString()}`);

          const jobData = {
            eventId: event._id,
            eventName: event.name,
            eventLocation: event.location,
            eventStartDate: eventStartTime.toISOString(), // Ensure consistent format
            reminderHours: interval.hours || null,
            reminderMinutes: interval.minutes || null,
            scheduledAt: now.toISOString(),
            reminderTime: reminderTime.toISOString()
          };

          console.log(`   📋 Job data:`, jobData);

          const job = await eventReminderQueue.add('send-event-reminder', jobData, {
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
      console.error('Stack trace:', error.stack);
      throw error;
    }
  }

  /**
   * Verify that jobs were actually scheduled in the queue
   */
/**
 * Verify that jobs were actually scheduled in the queue - FIXED VERSION
 */
static async verifyScheduledJobs(eventId) {
  try {
    console.log(`\n🔍 Verifying scheduled jobs for event ${eventId}:`);
    
    const jobIds = [`${eventId}-24h`, `${eventId}-5h`, `${eventId}-15m`];
    
    for (const jobId of jobIds) {
      const job = await eventReminderQueue.getJob(jobId);
      if (job) {
        // Fix: Check if delay exists and is a valid number
        const delay = job.opts && typeof job.opts.delay === 'number' ? job.opts.delay : null;
        
        if (delay !== null && delay >= 0) {
          const executeAt = new Date(Date.now() + delay);
          // Additional check to ensure the date is valid
          if (!isNaN(executeAt.getTime())) {
            console.log(`   ✅ Job ${jobId} found - executes at: ${executeAt.toISOString()}`);
          } else {
            console.log(`   ⚠️ Job ${jobId} found but has invalid execution time`);
          }
        } else {
          console.log(`   ⚠️ Job ${jobId} found but has no valid delay (delay: ${delay})`);
        }
        
        // Also log job data for debugging
        console.log(`   📋 Job data: eventName=${job.data?.eventName}, reminderTime=${job.data?.reminderHours || job.data?.reminderMinutes}`);
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
    
    // Log event-specific job details
    if (eventJobs.length > 0) {
      console.log(`📋 Event jobs details:`);
      eventJobs.forEach((job, index) => {
        const delay = job.opts && typeof job.opts.delay === 'number' ? job.opts.delay : null;
        const reminderType = job.data?.reminderHours ? `${job.data.reminderHours}h` : 
                           job.data?.reminderMinutes ? `${job.data.reminderMinutes}m` : 'unknown';
        
        if (delay !== null && delay >= 0) {
          const executeAt = new Date(Date.now() + delay);
          if (!isNaN(executeAt.getTime())) {
            console.log(`   ${index + 1}. ${job.id} (${reminderType}) - executes at: ${executeAt.toISOString()}`);
          } else {
            console.log(`   ${index + 1}. ${job.id} (${reminderType}) - invalid execution time`);
          }
        } else {
          console.log(`   ${index + 1}. ${job.id} (${reminderType}) - no valid delay`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error verifying scheduled jobs:', error);
    console.error('Stack trace:', error.stack);
  }
}

  /**
   * Enhanced event reminder processing with detailed logging and proper date handling
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

      // Enhanced data with parsing-friendly structure
      const data = {
        type: 'event_reminder',
        eventId: eventId.toString(),
        eventName,
        eventLocation: eventLocation || '',
        eventStartDate: jobData.eventStartDate, // Use the properly formatted date from job data
        reminderTime: reminderHours ? `${reminderHours}h` : `${reminderMinutes}m`,
        reminderHours: reminderHours ? reminderHours.toString() : null,
        reminderMinutes: reminderMinutes ? reminderMinutes.toString() : null,
        timestamp: Date.now().toString(),
        actionType: 'view_event'
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
          const executeAt = new Date(Date.now() + job.opts.delay);
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
          executeAt: new Date(Date.now() + job.opts.delay)
        }))
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;