const fetch = require("node-fetch");

// Utility: Process orders with concurrency control
async function processOrdersWithConcurrency(orders, apiKey, concurrency = 5) {
  const results = [];
  const total = orders.length;

  for (let i = 0; i < total; i += concurrency) {
    const batch = orders.slice(i, i + concurrency);
    const promises = batch.map(async (order) => {
      try {
        // Skip non-completed orders early
        if (order.status?.toLowerCase() !== "completed") {
          return null;
        }

        const detailUrl = `https://bulkprovider.com/adminapi/v2/orders/${order.id}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            "X-Api-Key": apiKey,
          },
        });

        if (!detailRes.ok) return null;

        const detailData = await detailRes.json();
        const orderInfo = detailData?.data;

        if (!orderInfo?.created || !orderInfo?.last_update) return null;

        const createdTime = new Date(orderInfo.created);
        const updatedTime = new Date(orderInfo.last_update);
        if (isNaN(createdTime) || isNaN(updatedTime)) return null;

        const diffMs = updatedTime - createdTime;
        const diffMin = Math.floor(diffMs / 60000);
        const diffSec = Math.floor((diffMs % 60000) / 1000);
        const completed_time = `${diffMin} Minutes ${diffSec} Seconds`;

        return {
          order_id: orderInfo.id,
          service_id: orderInfo.service_id,
          service_name: orderInfo.service_name,
          status: orderInfo.status,
          quantity: orderInfo.quantity,
          completed_time, // ✅ only completed_time (not average_time)
          order_created: orderInfo.created,
          order_updated: orderInfo.last_update,
          username: orderInfo.user,
        };
      } catch (err) {
        console.warn(`Failed to enrich order ${order.id}:`, err.message);
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults.filter(Boolean));
  }

  return results;
}

exports.handler = async (event) => {
  try {
    const {
      created_from = "0",
      created_to,
      limit = "100",   // Increased for better pagination
      offset = "0",
      sort = "date-desc",
    } = event.queryStringParameters || {};

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "API_KEY is missing in environment" }),
      };
    }

    const baseUrl = "https://bulkprovider.com/adminapi/v2/orders";

    // Step 1: Fetch order list
    const listUrl = new URL(baseUrl);
    listUrl.searchParams.append("created_from", created_from);
    listUrl.searchParams.append("limit", limit);
    listUrl.searchParams.append("offset", offset);
    listUrl.searchParams.append("sort", sort);
    if (created_to) listUrl.searchParams.append("created_to", created_to);
    // Force only "completed" status
    listUrl.searchParams.append("order_status", "completed");

    const listRes = await fetch(listUrl.toString(), {
      headers: { "X-Api-Key": apiKey },
    });

    if (!listRes.ok) {
      const text = await listRes.text();
      throw new Error(`List API error ${listRes.status}: ${text}`);
    }

    const listData = await listRes.json();
    const orders = listData?.data?.list || [];

    // Step 2: Enrich only completed orders (already filtered by API)
    const detailedOrders = await processOrdersWithConcurrency(orders, apiKey, 5);

    const result = {
      data: {
        count: detailedOrders.length,
        list: detailedOrders,
      },
      pagination: listData.pagination || {
        offset: parseInt(offset, 10) || 0,
        limit: parseInt(limit, 10) || 100,
      },
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result, null, 2),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
