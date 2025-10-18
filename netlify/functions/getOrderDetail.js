const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { id } = event.queryStringParameters || {};
  if (!id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing order ID' })
    };
  }

  try {
    const res = await fetch(`https://bulkprovider.com/adminapi/v2/orders/${id}`, {
      headers: { 'X-Api-Key': process.env.API_KEY }
    });

    if (!res.ok) {
      throw new Error(`Detail API Error: ${res.status}`);
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
