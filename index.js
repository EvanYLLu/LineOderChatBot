require('dotenv').config();

const channelAccessToken = process.env.channelAccessToken;
const channelSecret = process.env.channelSecret;

if (!channelAccessToken || !channelSecret) {
  console.error("未找到 channelAccessToken 或 channelSecret，請檢查 .env 檔案");
  process.exit(1); // 停止程式執行
}

const express = require('express');
const bodyParser = require('body-parser');
const { Client } = require('@line/bot-sdk');
const admin = require('firebase-admin');
const schedule = require("node-schedule");
const { handleMessage, handlePayment } = require('./handle.js');
const { paymentStatus, parsePaymentMessage, remindUnpaidCustomers } = require('./payment.js');  
const { parseOrderMessage, updateOrder, deleteOrder, orderMessages, summarizeOrders, formatCustomerSummary, formatItemSummary } = require('./order.js');


// 初始化 Firebase
const serviceAccount = require('/Users/evanlu/Desktop/node_project/line-lunch-order-bot/lunchbot-d167c-firebase-adminsdk-yj34g-130ab11b3f.json');  

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore(); // Firestore 實例

const userId = "Cf7974765621a6de2caa4a0076498d035"; // 可為用戶ID或群組ID

// 定時排程：每天早上 10 點發送提醒訂餐訊息
schedule.scheduleJob("0 10 * * 1-5", async () => {
  try {
    const message = {
      type: "text",
      text: "記得訂餐", // 自定訊息內容
    };
    await client.pushMessage(userId, message);
    console.log("10 點提醒訊息已成功發送");
  } catch (error) {
    console.error("10 點提醒訊息發送失敗:", error);
  }
});

// 定時排程：每天中午 12 點發送提醒吃飯訊息
schedule.scheduleJob("0 12 * * 1-5", async () => {
  try {
    const message = {
      type: "text",
      text: "記得吃飯", // 自定訊息內容
    };
    await client.pushMessage(userId, message);
    console.log("12 點提醒訊息已成功發送");
  } catch (error) {
    console.error("12 點提醒訊息發送失敗:", error);
  }
});

// 定時排程：每天下午 3 點發送提醒付錢訊息
schedule.scheduleJob("0 15 * * 1-5", async () => {
  try {
    const message = {
      type: "text",
      text: remindUnpaidCustomers(), // 自定訊息內容
    };
    await client.pushMessage(userId, message);
    console.log("15 點提醒訊息已成功發送");
  } catch (error) {
    console.error("15 點提醒訊息發送失敗:", error);
  }
});

// LINE bot 設置
const config = {
  channelAccessToken,  // 直接使用變數名稱
  channelSecret,       // 使用環境變數
};

console.log("channelAccessToken:", channelAccessToken);


const client = new Client(config);
const app = express();

const messages = [
  {
      type: 'text',
      text: 'Hello! This is a reply from the bot.'
  }
];



// 用來處理 POST 請求的 webhook
app.use(bodyParser.json());

let isOrderMode = false; // 是否進入點餐模式
let isPaymentMode = false; // 是否進入付款模式
//const orderMessages = [];
//const paymentStatus = {}; // 紀錄付款狀態，格式: { 顧客名稱: true/false }


// 處理 LINE Webhook
app.post("/callback", (req, res) => {
  const events = req.body.events;

  events.forEach(async (event) => {

    
    if (event.type === "message" && event.message.type === "text") {
        const messageText = event.message.text.trim();

        // 關鍵字列表
        const validCommands = ["收單", "加點", "修改-", "刪除-"];
        //const isOrderMessage = messageText.includes("-");
        const containsValidCommand = validCommands.some((cmd) => messageText.startsWith(cmd));


        // 如果訊息不符合任何已定義的指令或格式，直接忽略
        if (!containsValidCommand && !parseOrderMessage(messageText) && !parsePaymentMessage(messageText)) {
            console.log(`忽略訊息: ${messageText}`);
            return;
          }

        let responseMessage;

        // 優先處理付款模式
        if (isPaymentMode) {
          responseMessage = handlePayment(messageText);
        } else if (isOrderMode) {
        // 訂單已收單，但仍可處理收單指令和加點指令
        if (messageText === "收單") {
            responseMessage = "已經收單，無需重複執行。";
          } else if (messageText === "加點") {
            isOrderMode = false;
            isPaymentMode = false;
            responseMessage = "加點已開放，現在可以繼續新增訂單。";
          } else {
            responseMessage = "點餐已結束，無法接受新的訂單。";
          }
        } else if (messageText.startsWith("修改-")) {
        // 處理修改指令
          const updateRequest = parseUpdateOrderMessage(messageText);
          responseMessage = updateRequest
          ? updateOrder(orderMessages, updateRequest)
          : "修改指令格式錯誤，請使用：修改-顧客名稱-原品項-新品項*數量";
        } else if (messageText.startsWith("刪除-")) {
        // 處理刪除指令
          const deleteRequest = parseDeleteOrderMessage(messageText);
          if (deleteRequest) {
            responseMessage = deleteOrder(orderMessages, deleteRequest);
          
          // 刪除後，更新 paymentStatus
            const customer = deleteRequest.customer;
            const remainingOrders = orderMessages.filter((order) => order.startsWith(customer));

            // 如果該顧客沒有剩餘訂單，更新 paymentStatus
            if (remainingOrders.length === 0) {
              delete paymentStatus[customer];  // 顧客無訂單，刪除付款狀態
            }
          } else {
            responseMessage = "刪除指令格式錯誤，請使用：刪除-顧客名稱-品項";
          }
        } else if (messageText === "收單") {
         // 處理收單指令
          console.log(paymentStatus);
          isOrderMode = true;
          isPaymentMode = true;

          // 假設 orderMessages 是儲存所有訂單的地方，這裡會將訊息轉換為訂單
          // 確保這些訂單數據是來自於解析的訊息
          const orders = parseOrderMessage(messageText);  // 假設這裡傳入的是一個包含訂單的訊息

            if (orders && orders.length > 0) {
              orders.forEach(order => {
              // 確保每筆訂單都推入 orderMessages 陣列
              orderMessages.push(order);
              });
            } else {
              console.log("無法解析訂單，請檢查格式是否正確（顧客名稱-品項*數量）。");
            }

            // 彙整訂單
            const { byCustomer, byItem } = summarizeOrders(orderMessages);

            // 格式化結果
            const customerSummary = formatCustomerSummary(byCustomer);
            const itemSummary = formatItemSummary(byItem);

            // 清空訂單（如果需要清空 orderMessages）
            // orderMessages.length = 0;

            // 回覆彙整訊息
            await client.replyMessage(event.replyToken, [
              { type: "text", text: customerSummary },
              { type: "text", text: itemSummary },
            ]);

            return;
        } else if (messageText === "加點") {
          // 處理加點指令
          if (!isOrderMode) {
            responseMessage = "目前尚未收單，無需開放加點。";
          } else {
            isOrderMode = false;
            isPaymentMode = false;
            responseMessage = "加點已開放，現在可以繼續新增訂單。";
          }
        } else {
        // 處理新增訂單
          const orders = parseOrderMessage(messageText); // 解析訊息
          if (orders && orders.length > 0) {

            // 初始化回應訊息
            responseMessage = "已成功新增以下訂單：\n";
            // 將每筆訂單處理並加入 orderMessages
            orders.forEach(({ customer, item, quantity }) => {
            console.log(`執行點餐：${customer}`);
            console.log(`點餐項目：${item}`);
            console.log(`項目數量：${quantity}`);
            orderMessages.push(`${customer}-${item}*${quantity}`);

            // 累加每筆訂單到 responseMessage
            responseMessage += `${customer} 的訂單：${item}*${quantity}\n`;
            // 如果該顧客尚未存在於 paymentStatus，新增並設為未付款
            if (!paymentStatus[customer]) {
              paymentStatus[customer] = false;
              console.log(`${customer} 加入 paymentStatus 並設為未付款`);

                }
              });

          
            } else {
            // 當解析失敗時，返回錯誤訊息
              console.log("無法解析訂單，orders 未定義或為空。");
              responseMessage = "無法解析訂單，請檢查格式是否正確（顧客名稱-品項*數量）。";
              }

                    
          }

      

          await client.replyMessage(event.replyToken, {
                type: "text",
                text: responseMessage,
          });

    }
  });

  res.status(200).send("OK");

    
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
