const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const {
      created_from = "0",
      created_to,
      limit = "1000",
      offset = "0",
      sort = "date-desc",
    } = event.queryStringParameters || {};

    const apiKey = process.env.API_KEY || "your-default-api-key";
    const baseUrl = "https://bulkprovider.com/adminapi/v2/orders";

    // Step 1: Fetch order list
    const listUrl = new URL(baseUrl);
    listUrl.searchParams.append("created_from", created_from);
    listUrl.searchParams.append("limit", limit);
    listUrl.searchParams.append("offset", offset);
    listUrl.searchParams.append("sort", sort);
    if (created_to) listUrl.searchParams.append("created_to", created_to);

    const listRes = await fetch(listUrl.toString(), {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    });

    if (!listRes.ok) {
      throw new Error(`List API error: ${listRes.status}`);
    }

    const listData = await listRes.json();
    const orders = listData?.data?.list || [];

    // Step 2: Filter only completed orders
    const completedOrders = orders.filter(
      (o) => o.status?.toLowerCase() === "completed"
    );

    // Step 3: For each order, get detailed info + completed_time
    const detailedOrders = await Promise.all(
      completedOrders.map(async (order) => {
        const detailUrl = `https://bulkprovider.com/adminapi/v2/orders/${order.id}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
        });

        if (!detailRes.ok) return null;
        const detailData = await detailRes.json();
        const info = detailData?.data;

        if (!info?.created || !info?.last_update) return null;

        const createdTime = new Date(info.created);
        const updatedTime = new Date(info.last_update);
        const diffMs = updatedTime - createdTime;
        const diffMin = Math.floor(diffMs / 60000);
        const diffSec = Math.floor((diffMs % 60000) / 1000);
        const completedTime = `${diffMin} Minutes ${diffSec} Seconds`;

        return {
          order_id: info.id,
          service_id: info.service_id,
          service_name: info.service_name,
          status: info.status,
          quantity: info.quantity,
          completed_time: completedTime,
          order_created: info.created,
          order_updated: info.last_update,
          username: info.user,
        };
      })
    );

    const finalList = detailedOrders.filter(Boolean);

    // Step 4: Build pagination URLs
    const offsetNum = parseInt(offset);
    const limitNum = parseInt(limit);
    const nextOffset = offsetNum + limitNum;
    const prevOffset = Math.max(0, offsetNum - limitNum);

    const baseApi = `${process.env.URL || "https://eloquent-cannoli-ed1c57.netlify.app"}/.netlify/functions/getOrders`;

    const queryParams = new URLSearchParams({
      created_from,
      limit: limitNum,
      sort,
    });
    if (created_to) queryParams.append("created_to", created_to);

    const prevUrl = `${baseApi}?${queryParams.toString()}&offset=${prevOffset}`;
    const nextUrl = `${baseApi}?${queryParams.toString()}&offset=${nextOffset}`;

    // Step 5: Final output
    const result = {
      data: {
        count: finalList.length,
        list: finalList,
      },
      pagination: {
        prev_page_href: prevOffset === offsetNum ? "" : prevUrl,
        next_page_href: nextUrl,
        offset: offsetNum,
        limit: limitNum,
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
