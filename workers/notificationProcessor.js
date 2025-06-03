const { notificationQueue, eventReminderQueue } = require('../config/queueConfig');
const NotificationService = require('../services/notificationService');
const { sendNotificationToDevice, sendNotificationToMultipleDevices } = require('../config/firebaseConfig');

// Process general notification jobs
notificationQueue.process('send-notification', async (job) => {
  const { userId, notification, data } = job.data;
  
  try {
    const result = await NotificationService.sendImmediateNotification(userId, notification, data);
    return result;
  } catch (error) {
    console.error('Error processing send-notification job:', error);
    throw error;
  }
});

notificationQueue.process('send-bulk-notification', async (job) => {
  const { userIds, notification, data } = job.data;
  
  try {
    const result = await NotificationService.sendNotificationToUsers(userIds, notification, data);
    return result;
  } catch (error) {
    console.error('Error processing send-bulk-notification job:', error);
    throw error;
  }
});

notificationQueue.process('send-event-update', async (job) => {
  const { event, updateType } = job.data;
  
  try {
    const result = await NotificationService.sendEventUpdateNotification(event, updateType);
    return result;
  } catch (error) {
    console.error('Error processing send-event-update job:', error);
    throw error;
  }
});

// Process event reminder jobs
eventReminderQueue.process('send-event-reminder', async (job) => {
  try {
    const result = await NotificationService.processEventReminder(job.data);
    return result;
  } catch (error) {
    console.error('Error processing send-event-reminder job:', error);
    throw error;
  }
});

// Process club notification jobs
notificationQueue.process('send-club-notification', async (job) => {
  const { clubId, notification, data } = job.data;
  
  try {
    const Club = require('../models/Club');
    const User = require('../models/User');
    
    const club = await Club.findById(clubId).populate('members');
    if (!club) {
      throw new Error('Club not found');
    }

    const users = await User.find({
      _id: { $in: club.members },
      fcmToken: { $exists: true, $ne: null },
      'notificationSettings.clubUpdates': true
    });

    if (users.length === 0) {
      return { success: true, message: 'No users to notify' };
    }

    const tokens = users.map(user => user.fcmToken);
    const result = await sendNotificationToMultipleDevices(tokens, notification, data);
    
    return result;
  } catch (error) {
    console.error('Error processing send-club-notification job:', error);
    throw error;
  }
});

// Log job completion and failures
notificationQueue.on('completed', (job, result) => {
  console.log(`✅ Notification job ${job.id} (${job.name}) completed successfully`);
});

notificationQueue.on('failed', (job, err) => {
  console.error(`❌ Notification job ${job.id} (${job.name}) failed:`, err.message);
});

eventReminderQueue.on('completed', (job, result) => {
  console.log(`✅ Event reminder job ${job.id} completed successfully`);
});

eventReminderQueue.on('failed', (job, err) => {
  console.error(`❌ Event reminder job ${job.id} failed:`, err.message);
});

console.log('📧 Notification processors started and ready to process jobs');

module.exports = {
  notificationQueue,
  eventReminderQueue
};