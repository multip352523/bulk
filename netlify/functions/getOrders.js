// netlify/functions/getOrders.js
const fetch = require('node-fetch');

exports.handler = async (event) => {
  try {
    const {
      limit = "1000",
      offset = "0",
      sort = "date-desc"
    } = event.queryStringParameters || {};

    const baseUrl = 'https://bulkprovider.com/adminapi/v2/orders';
    const url = new URL(baseUrl);

    url.searchParams.append('limit', parseInt(limit, 10) || 1000);
    url.searchParams.append('offset', parseInt(offset, 10) || 0);
    url.searchParams.append('sort', sort);

    const response = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': process.env.API_KEY || ''
      }
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
