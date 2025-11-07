// getOrders.js — ফিক্সড ভার্সন
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { 
    service_id,
    created_from = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000),
    limit = "1000",
    offset = "0",
    sort = "date-desc"
  } = event.queryStringParameters || {};

  try {
    // Step 1: greatfollows.com থেকে সব completed অর্ডার নিন
    const url = new URL('https://bulkprovider.com/adminapi/v2/orders');
    url.searchParams.append('order_status', 'completed');
    url.searchParams.append('created_from', created_from);
    url.searchParams.append('limit', limit);
    url.searchParams.append('offset', offset);
    url.searchParams.append('sort', sort);

    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': process.env.API_KEY }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`greatfollows API Error ${res.status}: ${text}`);
    }

    const data = await res.json();
    let list = data.data?.list || [];

    // Step 2: service_id দেওয়া থাকলে, ফিল্টার করুন
    if (service_id) {
      const targetId = String(service_id).trim();
      list = list.filter(order => {
        return String(order.service_id).trim() === targetId;
      });
    }

    // Step 3: ফিল্টার করা ডেটা রিটার্ন করুন (সঠিক সিনট্যাক্স)
    const response = {
      ...data,
      data: {
        ...data.data,
        list,
        count: list.length // অপশনাল: আপডেটেড কাউন্ট
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(response)
    };
  } catch (err) {
    console.error('[getOrders] Error:', err);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
