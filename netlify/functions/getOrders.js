const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const {
      created_from = "0",
      created_to,
      limit = "100",
      offset = "0",
      sort = "date-desc",
    } = event.queryStringParameters || {};

    const apiKey = process.env.API_KEY || "your-default-api-key";
    const baseUrl = "https://bulkprovider.com/adminapi/v2/orders";

    // Step 1: Fetch Order List
    const listUrl = new URL(baseUrl);
    listUrl.searchParams.append("created_from", created_from);
    listUrl.searchParams.append("limit", limit);
    listUrl.searchParams.append("offset", offset);
    listUrl.searchParams.append("sort", sort);
    listUrl.searchParams.append("order_status", "completed"); // ✅ Only completed orders

    if (created_to) listUrl.searchParams.append("created_to", created_to);

    const listRes = await fetch(listUrl.toString(), {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    });

    if (!listRes.ok) throw new Error(`List API error: ${listRes.status}`);

    const listData = await listRes.json();
    const orders = listData?.data?.list || [];

    // Step 2: Fetch details for each completed order
    const detailedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          const detailUrl = `https://bulkprovider.com/adminapi/v2/orders/${order.id}`;
          const detailRes = await fetch(detailUrl, {
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": apiKey,
            },
          });
          if (!detailRes.ok) return null;

          const detailData = await detailRes.json();
          const o = detailData?.data;

          if (!o?.created || !o?.last_update || o.status !== "completed")
            return null;

          const createdTime = new Date(o.created);
          const updatedTime = new Date(o.last_update);

          if (isNaN(createdTime) || isNaN(updatedTime)) return null;

          const diffMs = updatedTime - createdTime;
          const diffMin = Math.floor(diffMs / 60000);
          const diffSec = Math.floor((diffMs % 60000) / 1000);

          return {
            order_id: o.id,
            service_id: o.service_id,
            service_name: o.service_name,
            status: o.status,
            quantity: o.quantity,
            completed_time: `${diffMin} Minutes ${diffSec} Seconds`,
            order_created: o.created,
            order_updated: o.last_update,
            username: o.user,
          };
        } catch {
          return null;
        }
      })
    );

    const finalList = detailedOrders.filter(Boolean);

    // Step 3: Pagination
    const offsetNum = parseInt(offset);
    const limitNum = parseInt(limit);
    const prevOffset = Math.max(0, offsetNum - limitNum);
    const nextOffset = offsetNum + limitNum;

    const baseApi = `${process.env.URL || "https://eloquent-cannoli-ed1c57.netlify.app"}/.netlify/functions/getOrders`;
    const queryParams = new URLSearchParams({
      created_from,
      limit,
      sort,
    });
    if (created_to) queryParams.append("created_to", created_to);

    const prev_page_href =
      prevOffset === offsetNum
        ? ""
        : `${baseApi}?${queryParams.toString()}&offset=${prevOffset}`;
    const next_page_href = `${baseApi}?${queryParams.toString()}&offset=${nextOffset}`;

    // Step 4: Final Response
    const result = {
      data: {
        count: finalList.length,
        list: finalList,
      },
      pagination: {
        prev_page_href,
        next_page_href,
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
