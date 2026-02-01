import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";

// 配置
const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const RECEIVE_ID = "oc_da77f70fbb70a836fcb385e1a2007094"; // 当前对话 ID
const FILE_PATH = "/home/work/clawd/AGENTS.md"; // 要发送的文件

// 创建客户端
const client = new Lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
});

async function sendFile() {
  try {
    console.log("尝试发送文件: AGENTS.md");

    // 读取文件内容
    const fileContent = fs.readFileSync(FILE_PATH);
    console.log("文件大小:", fileContent.length, "字节");

    // 先尝试发送文本消息，包含文件内容
    const textContent = fileContent.toString('utf-8');
    console.log("文本长度:", textContent.length, "字符");

    const sendResponse = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: RECEIVE_ID,
        msg_type: "text",
        content: JSON.stringify({
          text: "📄 AGENTS.md 文件内容:\n\n" + textContent,
        }),
      },
    });

    console.log("发送响应:", JSON.stringify(sendResponse, null, 2));

    if (sendResponse.code === 0) {
      console.log("\n✅ AGENTS.md 内容发送成功！");
      console.log("消息 ID:", sendResponse.data?.message_id);
      console.log("\n📄 请查看 Lark 对话中的文件内容");
    } else {
      console.error("\n❌ 发送失败:", sendResponse.msg);
    }
  } catch (error) {
    console.error("\n❌ 错误详情:");
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

sendFile();
