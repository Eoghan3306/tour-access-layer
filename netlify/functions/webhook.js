export async function handler(event) {
  // If this is a browser request with a token
  if (event.httpMethod === "GET") {
    const token = event.queryStringParameters?.token;

    // TEMP: test token
    if (token === "test123") {
      return {
        statusCode: 200,
        body: JSON.stringify({
          redirect: "https://muckross-tour.netlify.app"
        })
      };
    }

    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Invalid token" })
    };
  }

  // Default response
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Webhook endpoint ready" })
  };
}
