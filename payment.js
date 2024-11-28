// payment.js

//const { orderMessages, paymentStatus } = require('./index'); // 引用主程式中的變數

const paymentStatus = {}; // 紀錄付款狀態

// 付款解析函式
function parsePaymentMessage(messageText) {
  const regex = /^([\u4e00-\u9fa5a-zA-Z0-9]+)-([\d]+)-([\u4e00-\u9fa5a-zA-Z ]+)$/;
  const match = messageText.match(regex);

  if (!match) {
    return null; // 格式不符
  }

  return {
    customer: match[1], // 顧客名稱
    amount: parseInt(match[2], 10), // 金額
    method: match[3].trim(), // 付款方式
  };
}

function remindUnpaidCustomers() {
  // 遍歷所有顧客，檢查付款狀態
  const unpaidCustomers = [];

  // 遍歷 paymentStatus 物件
  for (const customer in paymentStatus) {
      if (paymentStatus[customer] === false) {
          // 如果顧客未付款，將顧客名稱加入未付款顧客列表
          unpaidCustomers.push(customer);
      }
  }

  // 如果有未付款顧客，顯示提醒訊息
  if (unpaidCustomers.length > 0) {
      return `尚未付款：${unpaidCustomers.join(", ")}。`, legalAttestLetter;
  } else {
      return "所有顧客已完成付款。";
  }
}

module.exports = { paymentStatus, parsePaymentMessage, remindUnpaidCustomers };

