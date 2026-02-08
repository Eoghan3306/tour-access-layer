const tourLinks = {
  'test123': 'https://muckrosspt.netlify.app', // live static tour used for testing
  // Later you can add more tokens here, e.g. 'tour456': 'https://another-tour.netlify.app'
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

