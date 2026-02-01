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

async function sendFileAsText() {
  try {
    console.log("读取文件: AGENTS.md");
    const fileContent = fs.readFileSync("/home/work/clawd/AGENTS.md", "utf-8");
    
    console.log("文件大小:", fileContent.length, "字符");
    console.log("\n发送文件内容到 Lark...");

    const sendResponse = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: RECEIVE_ID,
        msg_type: "text",
        content: JSON.stringify({
          text: `📎 文件: AGENTS.md\n📏 大小: ${fileContent.length} 字符\n\n--- 文件内容开始 ---\n\n${fileContent}\n\n--- 文件内容结束 ---`,
        }),
      },
    });

    console.log("发送响应:", JSON.stringify(sendResponse, null, 2));

    if (sendResponse.code === 0) {
      console.log("\n✅ AGENTS.md 文件内容发送成功！");
      console.log("消息 ID:", sendResponse.data?.message_id);
      console.log("\n💡 提示: 文件已作为文本消息发送");
      console.log("📄 你可以复制内容并保存为 .md 文件");
    } else {
      console.error("\n❌ 发送失败:", sendResponse.msg);
    }
  } catch (error) {
    console.error("\n❌ 错误:");
    console.error(error.message);
  }
}

sendFileAsText();
