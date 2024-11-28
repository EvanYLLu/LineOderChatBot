const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@line/bot-sdk');
const admin = require('firebase-admin');
const schedule = require("node-schedule");
const { paymentStatus, parsePaymentMessage, remindUnpaidCustomers } = require('./payment.js');  
const { parseOrderMessage, updateOrder, deleteOrder, orderMessages } = require('./order.js');

// 處理訊息事件
async function handleMessage(messageText, replyToken) {
  let responseMessage;

  // 檢查是否處於付款模式
  if (isPaymentMode) {
    // 處理付款訊息
    responseMessage = handlePayment(messageText);
  } else if (isOrderClosed) {
    // 訂單已結束，不接受新訂單
    responseMessage = "點餐已結束，無法接受新的訂單。";
  } else if (messageText.startsWith("修改-")) {
    // 處理修改指令
    const updateRequest = parseUpdateOrderMessage(messageText);
    responseMessage = updateRequest
      ? updateOrder(orderMessages, updateRequest)
      : "修改指令格式錯誤，請使用：修改-顧客名稱-原品項-新品項*數量";
  } else if (messageText.startsWith("刪除-")) {
    // 處理刪除指令
    const deleteRequest = parseDeleteOrderMessage(messageText);
    responseMessage = deleteRequest
      ? deleteOrder(orderMessages, deleteRequest)
      : "刪除指令格式錯誤，請使用：刪除-顧客名稱-品項";
  } else if (messageText === "收單") {
    responseMessage = listPaymentStatus(replyToken)
    // 收單指令：進入付款模式
    isOrderClosed = true;
    isPaymentMode = true;
    const { byCustomer, byItem } = summarizeOrders(orderMessages);

    // 格式化結果
    const customerSummary = formatCustomerSummary(byCustomer);
    const itemSummary = formatItemSummary(byItem);

    // 清空訂單記錄
    orderMessages.length = 0;

    // 回覆收單訊息
    await client.replyMessage(replyToken, [
      { type: "text", text: customerSummary },
      { type: "text", text: itemSummary },
    ]);
    return;
  } else if (messageText === "加點") {
    // 開放加點
    if (!isOrderClosed) {
      responseMessage = "目前尚未收單，無需開放加點。";
    } else {
      isOrderClosed = false;
      isPaymentMode = false;
      responseMessage = "加點已開放，現在可以繼續新增訂單。";
    }
  } else {
    // 預設新增訂單
    const order = parseOrderMessage(messageText);
    //responseMessage = order
      //? `${order.customer} 已成功新增訂單：${order.order}*${order.quantity}`
      //: "無法解析訂單，請檢查格式是否正確（顧客名稱-品項*數量）。";
    
    if (order) {
      orderMessages.push(`${order.customer}-${order.order}*${order.quantity}`);
      
      // 在新增訂單時，將顧客的付款狀態設為 false，表示尚未付款
      if (!paymentStatus[order.customer]) {
        paymentStatus[order.customer] = false;  // 尚未付款
        console.log(`${order.customer} 設為未付款`);
      }
      // 建立回應訊息
    responseMessage = `${order.customer} 已成功新增訂單：${order.order}*${order.quantity}`;
    } else {
    responseMessage = "無法解析訂單，請檢查格式是否正確（顧客名稱-品項*數量）。";
    }



    
  }

  // 回傳處理結果
  await client.replyMessage(replyToken, { type: "text", text: responseMessage });
}


function handlePayment(messageText) {

    let paymentInfo = parsePaymentMessage(messageText);

    if (!paymentInfo || typeof paymentInfo !== "object") {
      
      console.log("忽略其他訊息")
      //console.error("paymentInfo 為 null 或 undefined，無法處理付款資訊:", paymentInfo);
      return //"在你的格式打對之前，我不會處理你的付款😡（範例：顧客名稱-金額-付款方式）。";
    }

    //const paymentInfo = parsePaymentMessage(messageText);
    if (!paymentInfo) {
      console.log("361檢查 paymentInfo:", paymentInfo);

      console.error("paymentInfo 為 null 或 undefined，無法處理付款資訊");
      return 
    }
  
    const { customer, amount, method } = paymentInfo;

    if (!customer || !amount || !method) {
      console.error("付款訊息缺少必要字段:", paymentInfo);
      return //"付款資訊不完整，請提供顧客名稱、金額與付款方式。";
    }
  
    // 合法付款方式清單
    const validPaymentMethods = ["現金", "line pay", "轉帳", "中信", "賴配"];
  
    // 驗證付款方式
    //if (!validPaymentMethods.includes(method)) {
      //return `付款方式無效，請使用以下其中一種：現金、line pay、轉帳、或其他有效付款方式。`;
    //}
  
    // 檢查顧客是否在訂單中
    const customerOrderExists = orderMessages.some((message) => message.startsWith(`${customer}`));
    if (!customerOrderExists) {
      console.log("380檢查 paymentInfo:", paymentInfo);

        console.log(paymentStatus, "==> 382");
        console.log(orderMessages, "==> 383");
        console.log(`${customer}`, "==> 384");
      return `${customer} 未在訂單名單中，請確認顧客名稱是否正確。`;
    }
  
    // 如果顧客名稱存在於訂單中，加入到付款狀態中
    if (!paymentStatus[customer] && paymentStatus[customer] !== true) {
      paymentStatus[customer] = false;  // 初始化為未付款
    }
  
    // 完成付款，更新顧客付款狀態
    paymentStatus[customer] = true;
    
    // 找出並移除符合顧客名稱的訂單
  const orderIndex = orderMessages.findIndex((message) =>
  message.startsWith(`${customer}`)
);

if (orderIndex > -1) {
  // 使用 splice 移除指定的訂單，而不需要重新賦值
  orderMessages.splice(orderIndex, 1);
  return `${customer} 已完成付款，金額：${amount}，付款方式：${method}。`;
}
    console.log(orderMessages, "==> 341");
    return remindUnpaidCustomers();

    
  }


  module.exports = { handleMessage, handlePayment };