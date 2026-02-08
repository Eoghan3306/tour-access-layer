const tourLinks = {
  'test123': '/tour-test.html', // static link to your test tour
};

export async function handler(event, context) {
  try {
    const body = JSON.parse(event.body);       // Lemon Squeezy sends JSON
    const token = body.data.token;             // extract token
    const redirectUrl = tourLinks[token];

    if (redirectUrl) {
      return {
        statusCode: 302,
        headers: { Location: redirectUrl },
      };
    } else {
      return { statusCode: 404, body: 'Invalid token' };
    }
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
}

