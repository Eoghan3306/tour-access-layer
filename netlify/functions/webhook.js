// netlify/functions/webhook.js
import crypto from 'crypto';

// In-memory store (for testing); use a DB for production
const activeTokens = {};

const tourLinks = {
  'Discover Killarney National Park': 'https://nationalparktour.netlify.app',
  "Hag's Glen": 'https://hagsglen.netlify.app',
  'Muckross Park Revealed': 'https://muckrosspt.netlify.app',
  'Ross Island Uncovered': 'https://rosscastletour.netlify.app',
};

export async function handler(event, context) {
  try {
    const body = JSON.parse(event.body);

    // Example: get license key and product name from webhook
    const licenseKey = body.data?.license?.key || body.data?.license?.id; 
    const productName = body.data?.line_items?.[0]?.name;

    if (!licenseKey || !productName) {
      return { statusCode: 400, body: 'Missing license key or product name' };
    }

    // Generate a unique redirect token
    const redirectToken = crypto.randomBytes(12).toString('hex');

    // Store it (in-memory for testing; DB for production)
    activeTokens[redirectToken] = {
      licenseKey,
      productName,
      expires: Date.now() + 24 * 60 * 60 * 1000 // optional 24h expiration
    };

    // Construct the redirect URL
    const tourUrl = tourLinks[productName];
    const redirectUrl = `${tourUrl}?token=${redirectToken}`;

    return {
      statusCode: 302,
      headers: { Location: redirectUrl },
    };
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
}
