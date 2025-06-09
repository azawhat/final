const admin = require('firebase-admin');


const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4OSCou8vJG96w\nsGtXOYS7JD6xumNkyBVmTktHtbIbi3kcpg5LQlcFMqX4WPGSeSBOreosQa20hDEn\nWzQypdUfAxmbmWtM+kLENl7dC5pHd1paEsexaRODDeOcXaE0SqZlG7P6V+zdxQsM\nDxRfgufmdY7zaswgavBNZEjm9Kq3DSWEMbSZvERqprzxuRqHkIas6YpSwCYeyk2/\nXRrDQa0obwN5+YfUcPMRHUCl9tuV5Dz0MOa3lywCivdU50TZp79hD5IX8Qe0b7Uv\nYtc4IxiaFPhDaiH3CBD1ebgtXns7WN+RorneIpm4KmNxYD3Ffe1ugLYMUYgobWxa\n9MDulXVNAgMBAAECggEACISKWDLiqmhG+h1ra8uFhw+XHymSiejfEG1jTqv90bHi\nW4A+s0fHH+mRF0lUK2USqNX4DgF1Z3N16wTCW5XOTlJFigEPHy6HuBcZeMKeE1rX\nNcieLLuX2DHkCb6h2E9Gn/B8IwGTZUeZ31NdKkiyXItSnOTzDjao6LMlKcSQlh5f\nDURd9XBxR0eHU6p8ZKL0cwMHaFFRkMBLIvzBglZFpcUNMm70cyOIj6KAj2Ko9uVp\n/Gzh9V6KaMTUh2D4aWzTTrTHcq02xTPlIBMfkt1YPEEsRTJXBqJsBWusTdGLw5IA\nK3CSSTBtQAwQpC7yNRLVWnPBIn+XC4CXN6zRrj/N4QKBgQD5QtaoVyeIiNSmOMNo\noEUCLjQq3rE9XtPxAbRtvG1dfDJ7Oe7zpxonIxFo2B8VDy2q4XRSSjmAURNud9L8\nhFgRNGqOao8c0IzqFIoOvxH8s2YGxVgeiPW8vMFC8DFzOePrqI2n/9osj5WC2alA\nnli4inriR6ULfHL5CMQyLmr08QKBgQC9NCemCXbWH63ZrjtnNZ/TPJZxzJ7SuMsL\nrt6FQU+EoGRTsDywBUuOtQdHSjoHXOAz8ZLh/X7OmePKH65CBRaB5vdfgDZUEMLR\nE962bC0Fvm9BKFosAzQ41X3ysrg5tu8RYuM4KODTg0pf9Ypu0v773kEyqhlFM0u7\nxYj/BhsWHQKBgQCbfThOlt+QalrMvggX0jJ6I7xjKbvCns7zPq8A7VQDxx/ugrsu\nvwSveU646mipSGiiejWHx8mK5AiNFq5E24Hcaag24v4XaXkd5GYiwMpFqttwSdao\nZaN1cwHT8eXHDUvCi8iiDhZZSdBoacMNDjomFCyHz02DlsRZ2UAaVZ5e4QKBgQC4\nTTid/TQcKimwFI9a3xp7qtYlrhu7yjRHgiTSCyeJWq+/8bl8APxz25VmdUCHcYoY\nLyZUKxk96RvCBRA60Tf2e+TVy0+gnd8XyNI2QrOsl69J+iO0Ib7Z6eTQ6BSaa77+\n4aPSTceLYaWuScF6aN/mur4puxX4mZoZI7dqLClwZQKBgDf5OZEsuSCG/A1k96el\n08ekfVukygZGBI5hupIt6RtQuMcQsx088vhKpGr5AesRS8lBdTxoPVodvKIlqQQV\nnZFJwFTpP379vvTBmrqETiKSjdZvaNgGg9WRp5j7aAa3b3jf9hOLiNniGW3972lV\nLpJKrsD9mXsTtHG6otIKOq48\n-----END PRIVATE KEY-----\n",
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