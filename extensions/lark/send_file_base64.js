import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";

// 配置
const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const RECEIVE_ID = "oc_da77f70fbb70a836fcb385e1a2007094";

// 创建客户端
const client = new Lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
});

async function sendFileAsBase64() {
  try {
    console.log("读取文件并转换为 base64...");
    const fileContent = fs.readFileSync("/home/work/clawd/AGENTS.md", "utf-8");
    const base64Content = Buffer.from(fileContent, "utf-8").toString("base64");
    
    console.log("文件大小:", fileContent.length, "字符");
    console.log("Base64 大小:", base64Content.length, "字符");

    console.log("\n发送文件（base64 编码）到 Lark...");
    const sendResponse = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: RECEIVE_ID,
        msg_type: "text",
        content: JSON.stringify({
          text: `📎 文件: AGENTS.md\n📏 大小: ${fileContent.length} 字符\n🔐 已 base64 编码\n\nBase64 内容:\n${base64Content}\n\n💡 解码方法: Buffer.from(base64, 'base64').toString('utf-8')`,
        }),
      },
    });

    console.log("发送响应:", JSON.stringify(sendResponse, null, 2));

    if (sendResponse.code === 0) {
      console.log("\n✅ 文件内容（base64）发送成功！");
      console.log("消息 ID:", sendResponse.data?.message_id);
      console.log("\n📄 文件已编码为 base64 格式发送");
      console.log("🔧 可以用 base64 解码工具还原原文件");
    } else {
      console.error("\n❌ 发送失败:", sendResponse.msg);
    }
  } catch (error) {
    console.error("\n❌ 错误:");
    console.error(error.message);
  }
}

sendFileAsBase64();
