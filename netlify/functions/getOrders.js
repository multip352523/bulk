const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const {
      created_from = "0",
      created_to,
      order_status,
      user,
      limit = "100",
      offset = "0",
      sort = "date-desc"
    } = event.queryStringParameters || {};

    const baseUrl = "https://bulkprovider.com/adminapi/v2/orders";
    const url = new URL(baseUrl);

    // Convert limit/offset to numbers
    const offsetNum = parseInt(offset);
    const limitNum = parseInt(limit);

    // Add query params
    url.searchParams.append("created_from", created_from);
    url.searchParams.append("limit", limitNum);
    url.searchParams.append("offset", offsetNum);
    url.searchParams.append("sort", sort);
    if (created_to) url.searchParams.append("created_to", created_to);
    if (order_status) url.searchParams.append("order_status", order_status);
    if (user) url.searchParams.append("user", user);

    // Fetch data
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.API_KEY || "your-default-api-key",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const list = data?.data?.list || [];

    // 🕒 Calculate completed_time & filter required fields only
    const cleanedList = list.map((order) => {
      const created = order.created ? new Date(order.created) : null;
      const updated = order.last_update ? new Date(order.last_update) : null;
      let completed_time = "";

      if (created && updated && updated > created) {
        const diffMs = updated - created;
        const minutes = Math.floor(diffMs / 60000);
        const seconds = Math.floor((diffMs % 60000) / 1000);
        completed_time = `${minutes} Minutes ${seconds} Seconds`;
      }

      return {
        order_id: order.id,
        service_id: order.service_id,
        service_name: order.service_name,
        status: order.status,
        quantity: order.quantity,
        completed_time,
        order_created: order.created,
        order_updated: order.last_update,
        username: order.user,
      };
    });

    // 🔹 Pagination setup
    const baseApi =
      (process.env.URL
        ? `${process.env.URL}/.netlify/functions/getOrders`
        : "https://eloquent-cannoli-ed1c57.netlify.app/.netlify/functions/getOrders");

    const queryParams = new URLSearchParams({
      created_from,
      limit: limitNum,
      sort,
    });
    if (created_to) queryParams.append("created_to", created_to);
    if (order_status) queryParams.append("order_status", order_status);
    if (user) queryParams.append("user", user);

    const prevOffset = offsetNum > 0 ? Math.max(0, offsetNum - limitNum) : 0;
    const nextOffset = offsetNum + limitNum;

    const prevUrl =
      prevOffset < offsetNum
        ? `${baseApi}?${queryParams.toString()}&offset=${prevOffset}`
        : "";

    const nextUrl = `${baseApi}?${queryParams.toString()}&offset=${nextOffset}`;

    // 🔹 Final Output
    const result = {
      data: {
        count: cleanedList.length,
        list: cleanedList,
      },
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
