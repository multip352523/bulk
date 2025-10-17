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
      sort = "date-desc",
      // Optional: if you want to skip detailed time (for performance)
      skip_details = "0"
    } = event.queryStringParameters || {};

    const baseUrl = 'https://bulkprovider.com/adminapi/v2/orders';
    const url = new URL(baseUrl);

    const offsetNum = parseInt(offset, 10) || 0;
    const limitNum = parseInt(limit, 10) || 1000;

    // Build query for list API
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
    const listResponse = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.API_KEY || ''
      }
    });

    if (!listResponse.ok) {
      const errText = await listResponse.text();
      throw new Error(`List API Error: ${listResponse.status} ${errText}`);
    }

    const listData = await listResponse.json();

    // If skip_details=1, return raw list
    if (skip_details === "1") {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(listData)
      };
    }

    // Otherwise, enrich completed orders with completed_time
    const enrichedList = [];
    const completedOrders = (listData.data?.list || []).filter(
      order => order.status?.toLowerCase() === 'completed'
    );

    // Fetch details for each completed order
    for (const order of completedOrders) {
      try {
        const detailUrl = `https://bulkprovider.com/adminapi/v2/orders/${order.id}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            'X-Api-Key': process.env.API_KEY || ''
          }
        });

        if (!detailRes.ok) {
          // If detail fails, keep basic data
          enrichedList.push(order);
          continue;
        }

        const detail = await detailRes.json();
        const created = detail.data?.created;
        const lastUpdate = detail.data?.last_update;

        let completed_time = "N/A";
        if (created && lastUpdate) {
          const createdDate = new Date(created);
          const updatedDate = new Date(lastUpdate);
          if (!isNaN(createdDate) && !isNaN(updatedDate)) {
            const diffMs = updatedDate - createdDate;
            const minutes = Math.floor(diffMs / 60000);
            const seconds = Math.floor((diffMs % 60000) / 1000);
            completed_time = `${minutes} Minutes ${seconds} Seconds`;
          }
        }

        // Add new fields (matching the example you saw)
        enrichedList.push({
          ...order,
          order_created: created || order.created,
          order_updated: lastUpdate || order.last_update,
          completed_time
        });

      } catch (err) {
        // On error, push original order without time
        enrichedList.push(order);
      }
    }

    // Replace list with enriched list
    const result = {
      ...listData,
      data: {
        ...listData.data,
        list: enrichedList
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
    console.error("Netlify Function Error:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};
