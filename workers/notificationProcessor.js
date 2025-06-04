const { eventReminderQueue } = require('../config/queueConfig');
const NotificationService = require('../services/notificationService');

// Process event reminder jobs
eventReminderQueue.process('send-event-reminder', async (job) => {
  try {
    console.log(`Processing event reminder job ${job.id} for event ${job.data.eventName}`);
    const result = await NotificationService.processEventReminder(job.data);
    
    if (result.success) {
      console.log(`✅ Successfully sent reminder for event ${job.data.eventName}`);
    } else {
      console.log(`⚠️ Reminder processing completed with message: ${result.message || result.error}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ Error processing send-event-reminder job ${job.id}:`, error);
    throw error;
  }
});

// Log job completion and failures
eventReminderQueue.on('completed', (job, result) => {
  const timeUnit = job.data.reminderHours ? `${job.data.reminderHours}h` : `${job.data.reminderMinutes}m`;
  console.log(`✅ Event reminder job ${job.id} (${timeUnit} for ${job.data.eventName}) completed successfully`);
});

eventReminderQueue.on('failed', (job, err) => {
  const timeUnit = job.data.reminderHours ? `${job.data.reminderHours}h` : `${job.data.reminderMinutes}m`;
  console.error(`❌ Event reminder job ${job.id} (${timeUnit} for ${job.data.eventName}) failed:`, err.message);
});

eventReminderQueue.on('stalled', (job) => {
  console.warn(`⚠️ Event reminder job ${job.id} stalled and will be retried`);
});

// Clean up completed jobs periodically
eventReminderQueue.on('global:completed', async () => {
  try {
    const completed = await eventReminderQueue.getCompleted();
    if (completed.length > 100) {
      const jobsToRemove = completed.slice(0, completed.length - 100);
      await Promise.all(jobsToRemove.map(job => job.remove()));
      console.log(`🧹 Cleaned up ${jobsToRemove.length} completed reminder jobs`);
    }
  } catch (error) {
    console.error('Error cleaning up completed jobs:', error);
  }
});

module.exports = {
  eventReminderQueue
};