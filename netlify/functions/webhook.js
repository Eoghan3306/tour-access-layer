const tourLinks = {
  'test123': '/tour-test.html', // test tour
  // later add real tour tokens here
};

export async function handler(event, context) {
  try {
    let token;

    if (event.httpMethod === 'GET') {
      // For browser testing: ?token=...
      token = event.queryStringParameters?.token;
    } else if (event.httpMethod === 'POST') {
      // For Lemon Squeezy webhook: JSON body { data: { token: "..." } }
      const body = JSON.parse(event.body);
      token = body.data?.token;
    }

    const redirectUrl = tourLinks[token];

    if (redirectUrl) {
      return {
        statusCode: 302,
        headers: { Location: redirectUrl },
      };
    } else {
      return {
        statusCode: 404,
        body: 'Invalid token',
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: 'Server error: ' + err.message,
    };
  }
}

