const Queue = require('bull');
const Redis = require('ioredis');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

// Create Redis client
const redis = new Redis(redisConfig);

// Create notification queue
const notificationQueue = new Queue('notification processing', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,           // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Event reminder queue for scheduled notifications
const eventReminderQueue = new Queue('event reminders', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
});

// Queue event listeners
notificationQueue.on('completed', (job, result) => {
  console.log(`Notification job ${job.id} completed:`, result);
});

notificationQueue.on('failed', (job, err) => {
  console.error(`Notification job ${job.id} failed:`, err.message);
});

eventReminderQueue.on('completed', (job, result) => {
  console.log(`Event reminder job ${job.id} completed:`, result);
});

eventReminderQueue.on('failed', (job, err) => {
  console.error(`Event reminder job ${job.id} failed:`, err.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down queues...');
  await notificationQueue.close();
  await eventReminderQueue.close();
  await redis.disconnect();
  process.exit(0);
});

module.exports = {
  notificationQueue,
  eventReminderQueue,
  redis
};