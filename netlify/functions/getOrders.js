const fetch = require('node-fetch');

exports.handler = async (event) => {
  try {
    const {
      created_from = "0",
      created_to,
      order_status,
      mode,
      service_ids,
      creation_type,
      user,
      provider,
      ip_address,
      link,
      limit = "1000",
      offset = "0",
      sort = "date-desc"
    } = event.queryStringParameters || {};

    // ✅ FIXED: Removed trailing spaces
    const baseUrl = 'https://bulkprovider.com/adminapi/v2/orders';
    const url = new URL(baseUrl);

    const offsetNum = parseInt(offset, 10) || 0;
    const limitNum = parseInt(limit, 10) || 1000;

    url.searchParams.append('created_from', created_from);
    url.searchParams.append('limit', limitNum);
    url.searchParams.append('offset', offsetNum);
    url.searchParams.append('sort', sort);

    if (created_to) url.searchParams.append('created_to', created_to);
    if (order_status) url.searchParams.append('order_status', order_status);
    if (mode) url.searchParams.append('mode', mode);
    if (service_ids) url.searchParams.append('service_ids', service_ids);
    if (creation_type) url.searchParams.append('creation_type', creation_type);
    if (user) url.searchParams.append('user', user);
    if (provider) url.searchParams.append('provider', provider);
    if (ip_address) url.searchParams.append('ip_address', ip_address);
    if (link) url.searchParams.append('link', link);

    // Fetch order list
    const response = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': process.env.API_KEY || ''
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let orders = data?.data?.list || [];

    // ✅ ONLY enrich if order_status is "completed" (or not specified)
    const shouldEnrich = !order_status || order_status.toLowerCase() === 'completed';
    if (shouldEnrich) {
      const enrichedOrders = [];
      for (const order of orders) {
        if (order.status?.toLowerCase() !== 'completed') {
          enrichedOrders.push(order);
          continue;
        }

        try {
          // ✅ Fetch detail to get last_update
          const detailUrl = `https://bulkprovider.com/adminapi/v2/orders/${order.id}`;
          const detailRes = await fetch(detailUrl, {
            headers: { 'X-Api-Key': process.env.API_KEY || '' }
          });

          if (!detailRes.ok) {
            enrichedOrders.push(order);
            continue;
          }

          const detail = await detailRes.json();
          const o = detail.data;
          if (!o?.created || !o?.last_update) {
            enrichedOrders.push(order);
            continue;
          }

          const createdTime = new Date(o.created);
          const updatedTime = new Date(o.last_update);
          if (isNaN(createdTime) || isNaN(updatedTime)) {
            enrichedOrders.push(order);
            continue;
          }

          const diffMs = updatedTime - createdTime;
          const diffMin = Math.floor(diffMs / 60000);
          const diffSec = Math.floor((diffMs % 60000) / 1000);
          const completed_time = `${diffMin} Minutes ${diffSec} Seconds`;

          enrichedOrders.push({
            ...order,
            completed_time, // ✅ Inject completed_time
            order_created: o.created,
            order_updated: o.last_update
          });
        } catch (err) {
          enrichedOrders.push(order); // fallback to original
        }
      }
      orders = enrichedOrders;
    }

    // Build pagination links
    // ✅ FIXED: Removed trailing space in URL
    const baseApi = `${(process.env.URL || 'https://eloquent-cannoli-ed1c57.netlify.app')}/.netlify/functions/getOrders`;
    const queryParams = new URLSearchParams({
      created_from,
      limit: limitNum,
      sort
    });

    if (created_to) queryParams.append('created_to', created_to);
    if (order_status) queryParams.append('order_status', order_status);
    if (mode) queryParams.append('mode', mode);
    if (service_ids) queryParams.append('service_ids', service_ids);
    if (creation_type) queryParams.append('creation_type', creation_type);
    if (user) queryParams.append('user', user);
    if (provider) queryParams.append('provider', provider);
    if (ip_address) queryParams.append('ip_address', ip_address);
    if (link) queryParams.append('link', link);

    const prevOffset = Math.max(0, offsetNum - limitNum);
    const nextOffset = offsetNum + limitNum;

    const prevUrl = `${baseApi}?${queryParams.toString()}&offset=${prevOffset}`;
    const nextUrl = `${baseApi}?${queryParams.toString()}&offset=${nextOffset}`;

    const result = {
      ...data,
      data: {
        ...data.data,
        list: orders
      },
      pagination: {
        prev_page_href: prevOffset === offsetNum ? "" : prevUrl,
        next_page_href: nextUrl,
        offset: offsetNum,
        limit: limitNum
      }
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
