// order.js
let orderMessages = [];  // Store orders for customers
//const payment = require('./payment.js');  // Import payment handling

// 訂單解析函式
function parseOrderMessage(message) {
  // 分割訊息為多行
  const lines = message.split("\n").map((line) => line.trim()).filter((line) => line);

  const orders = []; // 儲存所有解析出的訂單
  const regex = /^([\u4e00-\u9fa5a-zA-Z0-9]+)-(.+?)(?:\*([\d]+))?(?:\s*\((.+)\))?$/;


  for (const line of lines) {
    const match = regex.exec(line);
    if (match) {
      const customer = match[1].trim();
      const orderContent = match[2];
      const remark = match[4] ? match[4].trim() : null; // 解析備註
      
      // 分解多個項目
      const items = orderContent.split(/\+/).reduce((result, part) => {
        const itemMatch = part.trim().match(/^(.+?)\*([\d]+)(?:\s*\((.+)\))?$/);
        if (itemMatch) {
          result.push({
            item: itemMatch[1].trim(),
            quantity: parseInt(itemMatch[2], 10),
            remark: itemMatch[3] ? itemMatch[3].trim() : remark, // 優先使用單項備註，否則使用整體備註
          });
        } else {
          // 當沒有數量標註時，默認數量為1
          result.push({
            item: part.trim(),
            quantity: 1,
            remark,
          });
        }
        return result;
      }, []);

      // 將每個項目加入到 orders 中
      items.forEach(({ item, quantity }) => {
        orders.push({
          customer,
          item,
          quantity,
          remark,
        });
      });
    }
  }

  return orders; // 確保回傳值為陣列
}

function parseUpdateOrderMessage(message) {
  const regex = /^修改-([\u4e00-\u9fa5a-zA-Z0-9]+)-(.+?)-(.+?)(?:\*([\d]+))?$/;
  const match = message.match(regex);

  if (!match) return null;

  return {
    customer: match[1],
    oldOrder: match[2].trim(),
    newOrder: match[3].trim(),
    quantity: parseInt(match[4] || "1", 10), // 預設數量為 1
  };
}

// 刪除指令解析函式
function parseDeleteOrderMessage(message) {
  const regex = /^刪除-([\u4e00-\u9fa5a-zA-Z0-9]+)-(.+)$/;
  const match = message.match(regex);

  if (!match) return null;

  return {
    customer: match[1],
    order: match[2].trim(),
  };
}


function updateOrder(messages, updateRequest) {
  const { customer, oldOrder, newOrder, quantity } = updateRequest;
  const orderIndex = messages.findIndex((message) => message.startsWith(`${customer}-${oldOrder}`));

  if (orderIndex === -1) {
    return `找不到 ${customer} 的訂單：${oldOrder}`;
  }

  messages[orderIndex] = `${customer}-${newOrder}*${quantity}`;
  return `已成功修改 ${customer} 的訂單：${oldOrder} -> ${newOrder}*${quantity}`;
}

// Delete order
function deleteOrder(messages, deleteRequest) {
  const { customer, order } = deleteRequest;
  const orderIndex = messages.findIndex((message) => message.startsWith(`${customer}-${order}`));

  if (orderIndex === -1) {
    return `${customer} 沒有訂購 ${order}。`;
  }

  messages.splice(orderIndex, 1);
  return `${customer} 的訂單已成功刪除：${order}`;
}

// 彙整訂單
function summarizeOrders(messages) {
  const byCustomer = {};
  const byItem = {};

  messages.forEach((message) => {
    const orders = parseOrderMessage(message); // 解析每筆訂單
    if (!orders || orders.length === 0) return;

    orders.forEach(({ customer, item, quantity }) => {
      // 按顧客彙整
      if (!byCustomer[customer]) {
        byCustomer[customer] = [];
      }
      byCustomer[customer].push({ item, quantity });

      // 按品項彙整
      if (!byItem[item]) {
        byItem[item] = { total: 0, customers: [] };
      }
      byItem[item].total += quantity;
      byItem[item].customers.push({ customer, quantity });
    });
  });

  return { byCustomer, byItem };
}


  // 格式化結果

  // 按訂餐人彙整
  function formatCustomerSummary(byCustomer) {
    let result = "訂餐明細:\n";
    for (const [customer, orders] of Object.entries(byCustomer)) {
      result +=   `\n${customer}:`;
      orders.forEach(({ item, quantity }) => {
        result +=     `${item} x${quantity}\n`;
      });
    }
    return result;
  }

  // 按品項彙整
  function formatItemSummary(byItem) {
    let result = "點餐友善:\n";
    for (const [item, data] of Object.entries(byItem)) {
      result +=   `\n${item}: ${data.total}份\n`;
      //result +=     `訂購者:`;
      //data.customers.forEach(({ customer, quantity }) => {
        //result +=       `x${quantity}\n;`
      //});
    }
    return result;
  }


// Exporting functions
module.exports = {
  orderMessages,
  parseUpdateOrderMessage,
  parseDeleteOrderMessage,
  parseOrderMessage,
  updateOrder,
  deleteOrder,
  summarizeOrders,
  formatCustomerSummary,
  formatItemSummary
};
