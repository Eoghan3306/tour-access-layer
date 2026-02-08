// Mapping of tokens to static tour URLs
const tourLinks = {
  'tour1-dkp94a': 'https://nationalparktour.netlify.app',       // Discover Killarney National Park
  'tour2-qwe73f': 'https://hagsglen.netlify.app',               // Hag’s Glen: Path to the Devil’s Ladder
  'tour3-rtx82v': 'https://muckrosspt.netlify.app',             // Muckross Park Revealed
  'tour4-plm65z': 'https://rosscastletour.netlify.app',         // Ross Island Uncovered
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

