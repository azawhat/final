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

// Event reminder queue for scheduled automatic notifications
const eventReminderQueue = new Queue('event reminders', {
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 50,    // Keep last 50 completed jobs for monitoring
    removeOnFail: 25,        // Keep last 25 failed jobs for debugging
    attempts: 3,             // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
  settings: {
    stalledInterval: 30 * 1000,    // Check for stalled jobs every 30 seconds
    maxStalledCount: 1,            // Max number of times a job can be recovered from stalled state
  }
});

// Queue event listeners for monitoring
eventReminderQueue.on('completed', (job, result) => {
  console.log(`Event reminder job ${job.id} completed successfully`);
});

eventReminderQueue.on('failed', (job, err) => {
  console.error(`Event reminder job ${job.id} failed:`, err.message);
});

eventReminderQueue.on('error', (error) => {
  console.error('Event reminder queue error:', error);
});

eventReminderQueue.on('waiting', (jobId) => {
  console.log(`Event reminder job ${jobId} is waiting to be processed`);
});

eventReminderQueue.on('active', (job, jobPromise) => {
  console.log(`Event reminder job ${job.id} is now active`);
});

eventReminderQueue.on('stalled', (job) => {
  console.warn(`Event reminder job ${job.id} has been stalled`);
});

// Health check for Redis connection
redis.on('connect', () => {
  console.log('📡 Redis connected successfully for notification queues');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down notification queues...');
  try {
    await eventReminderQueue.close();
    await redis.disconnect();
    console.log('✅ Queues and Redis connection closed successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down notification queues...');
  try {
    await eventReminderQueue.close();
    await redis.disconnect();
    console.log('✅ Queues and Redis connection closed successfully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  process.exit(0);
});

module.exports = {
  eventReminderQueue,
  redis
};