const Queue = require('bull');
const Event = require('../models/Event');

class EventExpirationService {
  constructor() {
    this.eventExpirationQueue = new Queue('event expiration', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
      }
    });

    this.eventExpirationQueue.process('expire-event', this.processEventExpiration);
    
    console.log('Event Expiration Service initialized');
  }

  async scheduleEventExpiration(event) {
    try {
      if (!event.startDate) {
        console.warn(`Event ${event._id} has no startDate, skipping expiration scheduling`);
        return;
      }

      const startDate = new Date(event.startDate);
      
      if (isNaN(startDate.getTime())) {
        console.error(`Invalid startDate format for event ${event._id}: ${event.startDate}`);
        return;
      }

      const expirationDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000)); // 24 hours after start
      const now = new Date();

      if (expirationDate <= now) {
        await this.expireEventNow(event._id);
        return;
      }

      const delay = expirationDate.getTime() - now.getTime();

      const jobOptions = {
        delay: delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      };

      await this.eventExpirationQueue.add(
        'expire-event',
        {
          eventId: event._id.toString(),
          eventName: event.name,
          scheduledExpirationDate: expirationDate.toISOString(),
        },
        jobOptions
      );

      console.log(`Scheduled expiration for event "${event.name}" at ${expirationDate.toISOString()}`);
    } catch (error) {
      console.error('Error scheduling event expiration:', error);
    }
  }

  async processEventExpiration(job) {
    try {
      const { eventId, eventName } = job.data;
      
      console.log(`Processing expiration for event: ${eventName} (ID: ${eventId})`);

      const event = await Event.findById(eventId);
      if (!event) {
        console.warn(`Event ${eventId} not found, may have been deleted`);
        return;
      }

      if (!event.isActive) {
        console.log(`Event ${eventId} is already inactive`);
        return;
      }

      const startDate = new Date(event.startDate);

      if (isNaN(startDate.getTime())) {
        console.error(`Invalid startDate format for event ${eventId}: ${event.startDate}`);
        return;
      }
      
      const expirationTime = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
      const now = new Date();

      if (now >= expirationTime) {
        event.isActive = false;
        await event.save();
        
        console.log(`Event "${eventName}" has been set to inactive after 24 hours from start date`);

        
      } else {
        console.log(`Event ${eventId} expiration was called too early, rescheduling`);
        throw new Error('Rescheduling due to early execution');
      }
      
    } catch (error) {
      console.error('Error processing event expiration:', error);
      throw error;
    }
  }

  async expireEventNow(eventId) {
    try {
      const event = await Event.findById(eventId);
      if (event && event.isActive) {
        event.isActive = false;
        await event.save();
        console.log(`Event ${eventId} expired immediately`);
      }
    } catch (error) {
      console.error('Error expiring event immediately:', error);
    }
  }

  async cancelEventExpiration(eventId) {
    try {
      const jobs = await this.eventExpirationQueue.getJobs(['delayed', 'waiting']);
      const eventJobs = jobs.filter(job => job.data.eventId === eventId.toString());
      
      for (const job of eventJobs) {
        await job.remove();
        console.log(`Cancelled expiration job for event ${eventId}`);
      }
    } catch (error) {
      console.error('Error cancelling event expiration:', error);
    }
  }

  async rescheduleEventExpiration(event) {
    try {
      await this.cancelEventExpiration(event._id);
      
      await this.scheduleEventExpiration(event);
      
      console.log(`Rescheduled expiration for event ${event._id}`);
    } catch (error) {
      console.error('Error rescheduling event expiration:', error);
    }
  }

  async initializeExistingEvents() {
    try {
      console.log('Initializing expiration jobs for existing active events...');
      
      const activeEvents = await Event.find({ isActive: true });
      
      for (const event of activeEvents) {
        if (event.startDate) {
          const startDate = new Date(event.startDate);
          
          if (isNaN(startDate.getTime())) {
            console.warn(`Skipping event ${event._id} with invalid startDate: ${event.startDate}`);
            continue;
          }
          
          const expirationDate = new Date(startDate.getTime() + (24 * 60 * 60 * 1000));
          const now = new Date();
          
          if (expirationDate <= now) {
            await this.expireEventNow(event._id);
          } else {
            await this.scheduleEventExpiration(event);
          }
        }
      }
      
      console.log(`Initialized expiration for ${activeEvents.length} active events`);
    } catch (error) {
      console.error('Error initializing existing events:', error);
    }
  }
}

module.exports = new EventExpirationService();