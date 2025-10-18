const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    // Default date range: last 90 days
    const today = new Date();
    const past90 = new Date(today);
    past90.setDate(today.getDate() - 90);

    const {
      created_from = past90.toISOString().split("T")[0],
      created_to = today.toISOString().split("T")[0],
      order_status,
      mode,
      service_ids,
      creation_type,
      user,
      provider,
      ip_address,
      link,
      limit = "100",
      offset = "0",
      sort = "date-desc",
    } = event.queryStringParameters || {};

    const baseUrl = "https://bulkprovider.com/adminapi/v2/orders";
    const url = new URL(baseUrl);

    // Pagination setup
    const offsetNum = parseInt(offset);
    const limitNum = parseInt(limit);

    // Add query params
    url.searchParams.append("created_from", created_from);
    url.searchParams.append("created_to", created_to);
    url.searchParams.append("limit", limitNum);
    url.searchParams.append("offset", offsetNum);
    url.searchParams.append("sort", sort);

    if (order_status) url.searchParams.append("order_status", order_status);
    if (mode) url.searchParams.append("mode", mode);
    if (service_ids) url.searchParams.append("service_ids", service_ids);
    if (creation_type) url.searchParams.append("creation_type", creation_type);
    if (user) url.searchParams.append("user", user);
    if (provider) url.searchParams.append("provider", provider);
    if (ip_address) url.searchParams.append("ip_address", ip_address);
    if (link) url.searchParams.append("link", link);

    // Fetch from API
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.API_KEY || "your-default-api-key",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status} ${errText}`);
    }

    const rawData = await response.json();

    // 🧠 Auto-detect order list key
    const possibleKeys = ["orders", "data", "result", "list"];
    let orders = [];
    for (const key of possibleKeys) {
      if (Array.isArray(rawData[key])) {
        orders = rawData[key];
        break;
      }
      if (rawData.data && Array.isArray(rawData.data[key])) {
        orders = rawData.data[key];
        break;
      }
    }

    if (!orders.length) {
      console.log("⚠️ No orders found in API response keys:", Object.keys(rawData));
    }

    // Filter only completed orders
    const completedOrders = orders.filter((o) => o.status === "completed");

    // Calculate completed_time
    const finalOrders = completedOrders.map((o) => {
      const created = new Date(o.created || o.order_created || o.date);
      const updated = new Date(o.last_update || o.updated || o.order_updated);

      let completed_time = "N/A";
      if (!isNaN(created) && !isNaN(updated)) {
        const diffMs = updated - created;
        const diffMin = Math.floor(diffMs / 60000);
        const diffSec = Math.floor((diffMs % 60000) / 1000);
        completed_time = `${diffMin} Minutes ${diffSec} Seconds`;
      }

      return {
        order_id: o.id,
        service_id: o.service_id,
        service_name: o.service_name,
        status: o.status,
        quantity: o.quantity,
        completed_time,
        order_created: o.created || o.order_created,
        order_updated: o.last_update || o.order_updated,
        username: o.user || o.username,
      };
    });

    // Pagination URLs
    const baseApi = `${
      process.env.URL || "https://eloquent-cannoli-ed1c57.netlify.app"
    }/.netlify/functions/getOrders`;

    const queryParams = new URLSearchParams({
      created_from,
      created_to,
      limit: limitNum,
      sort,
    });

    const prevOffset = Math.max(0, offsetNum - limitNum);
    const nextOffset = offsetNum + limitNum;

    const prevUrl =
      prevOffset === offsetNum
        ? ""
        : `${baseApi}?${queryParams.toString()}&offset=${prevOffset}`;
    const nextUrl = `${baseApi}?${queryParams.toString()}&offset=${nextOffset}`;

    // Final result
    const result = {
      orders: finalOrders,
      pagination: {
        prev_page_href: prevUrl,
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
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
