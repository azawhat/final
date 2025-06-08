const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

const messaging = admin.messaging();

/**
 * Send notification to a single device
 * @param {string} token - FCM token
 * @param {Object} notification - Notification object with title and body
 * @param {Object} data - Additional data to send
 * @param {Object} options - Additional options (androidConfig, apnsConfig, etc.)
 */
const sendNotificationToDevice = async (token, notification, data = {}, options = {}) => {
  try {
    if (!token) {
      throw new Error('FCM token is required');
    }

    if (!notification || !notification.title || !notification.body) {
      throw new Error('Notification title and body are required');
    }

    const message = {
      token: token,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        ...data,
        timestamp: Date.now().toString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          ...options.android?.notification
        },
        ...options.android
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            alert: {
              title: notification.title,
              body: notification.body
            },
            ...options.apns?.payload?.aps
          }
        },
        headers: {
          'apns-priority': '10',
          ...options.apns?.headers
        },
        ...options.apns
      },
      ...options.message
    };

    // Log the message being sent (for debugging)
    console.log('📤 Sending FCM message:', {
      token: token.substring(0, 20) + '...',
      title: notification.title,
      body: notification.body.substring(0, 50) + (notification.body.length > 50 ? '...' : ''),
      dataKeys: Object.keys(data)
    });

    const response = await messaging.send(message);
    console.log('✅ Successfully sent message:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Error sending message:', error);
    
    // Check if it's a token-related error
    const tokenErrors = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered'
    ];
    
    const shouldUpdateToken = tokenErrors.includes(error.errorInfo?.code);
    
    return { 
      success: false, 
      error: error.message,
      code: error.errorInfo?.code,
      shouldUpdateToken
    };
  }
};

/**
 * Send notification to multiple devices
 * @param {Array} tokens - Array of FCM tokens
 * @param {Object} notification - Notification object with title and body
 * @param {Object} data - Additional data to send
 * @param {Object} options - Additional options
 */
const sendNotificationToMultipleDevices = async (tokens, notification, data = {}, options = {}) => {
  try {
    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    if (!notification || !notification.title || !notification.body) {
      throw new Error('Notification title and body are required');
    }

    // Remove any null, undefined, or empty tokens
    const validTokens = tokens.filter(token => token && token.trim().length > 0);
    
    if (validTokens.length === 0) {
      return { success: false, error: 'No valid tokens provided' };
    }

    const message = {
      tokens: validTokens,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        ...data,
        timestamp: Date.now().toString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          ...options.android?.notification
        },
        ...options.android
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            alert: {
              title: notification.title,
              body: notification.body
            },
            ...options.apns?.payload?.aps
          }
        },
        headers: {
          'apns-priority': '10',
          ...options.apns?.headers
        },
        ...options.apns
      },
      ...options.message
    };

    console.log('📤 Sending FCM multicast message:', {
      tokenCount: validTokens.length,
      title: notification.title,
      body: notification.body.substring(0, 50) + (notification.body.length > 50 ? '...' : ''),
      dataKeys: Object.keys(data)
    });

    const response = await messaging.sendEachForMulticast(message);
    console.log('✅ Successfully sent multicast messages:', {
      successCount: response.successCount,
      failureCount: response.failureCount
    });
    
    // Handle failed tokens
    const failedTokens = [];
    const invalidTokens = [];
    
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const token = validTokens[idx];
          failedTokens.push({
            token: token,
            error: resp.error?.message,
            code: resp.error?.code
          });
          
          // Check if token should be removed
          const tokenErrors = [
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered'
          ];
          
          if (tokenErrors.includes(resp.error?.code)) {
            invalidTokens.push(token);
          }
        }
      });
      
      if (failedTokens.length > 0) {
        console.log('❌ Failed tokens:', failedTokens.length);
        console.log('🗑️ Invalid tokens to remove:', invalidTokens.length);
      }
    }

    return { 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
      failedTokens: failedTokens,
      invalidTokens: invalidTokens
    };
    
  } catch (error) {
    console.error('❌ Error sending multicast message:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.errorInfo?.code
    };
  }
};

/**
 * Send notification to a topic
 * @param {string} topic - Topic name
 * @param {Object} notification - Notification object
 * @param {Object} data - Additional data
 * @param {Object} options - Additional options
 */
const sendNotificationToTopic = async (topic, notification, data = {}, options = {}) => {
  try {
    if (!topic) {
      throw new Error('Topic is required');
    }

    if (!notification || !notification.title || !notification.body) {
      throw new Error('Notification title and body are required');
    }

    const message = {
      topic: topic,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        ...data,
        timestamp: Date.now().toString()
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          ...options.android?.notification
        },
        ...options.android
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            alert: {
              title: notification.title,
              body: notification.body
            },
            ...options.apns?.payload?.aps
          }
        },
        headers: {
          'apns-priority': '10',
          ...options.apns?.headers
        },
        ...options.apns
      },
      ...options.message
    };

    console.log('📤 Sending FCM topic message:', {
      topic: topic,
      title: notification.title,
      body: notification.body.substring(0, 50) + (notification.body.length > 50 ? '...' : '')
    });

    const response = await messaging.send(message);
    console.log('✅ Successfully sent topic message:', response);
    return { success: true, messageId: response };
    
  } catch (error) {
    console.error('❌ Error sending topic message:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.errorInfo?.code
    };
  }
};

/**
 * Subscribe tokens to a topic
 * @param {Array} tokens - Array of FCM tokens
 * @param {string} topic - Topic name
 */
const subscribeToTopic = async (tokens, topic) => {
  try {
    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    if (!topic) {
      throw new Error('Topic is required');
    }

    const response = await messaging.subscribeToTopic(tokens, topic);
    console.log('✅ Successfully subscribed to topic:', response);
    return { success: true, response };
    
  } catch (error) {
    console.error('❌ Error subscribing to topic:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.errorInfo?.code
    };
  }
};

/**
 * Unsubscribe tokens from a topic
 * @param {Array} tokens - Array of FCM tokens
 * @param {string} topic - Topic name
 */
const unsubscribeFromTopic = async (tokens, topic) => {
  try {
    if (!tokens || tokens.length === 0) {
      return { success: false, error: 'No tokens provided' };
    }

    if (!topic) {
      throw new Error('Topic is required');
    }

    const response = await messaging.unsubscribeFromTopic(tokens, topic);
    console.log('✅ Successfully unsubscribed from topic:', response);
    return { success: true, response };
    
  } catch (error) {
    console.error('❌ Error unsubscribing from topic:', error);
    return { 
      success: false, 
      error: error.message,
      code: error.errorInfo?.code
    };
  }
};

module.exports = {
  messaging,
  sendNotificationToDevice,
  sendNotificationToMultipleDevices,
  sendNotificationToTopic,
  subscribeToTopic,
  unsubscribeFromTopic
};