import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";

// 配置
const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const RECEIVE_ID = "oc_da77f70fbb70a836fcb385e1a2007094"; // 当前对话 ID
const IMAGE_PATH = "/tmp/agents.png"; // AGENTS.md 转换的图片

// 创建客户端
const client = new Lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
});

async function sendImage() {
  try {
    // 步骤 1: 上传图片
    console.log("步骤 1: 上传 AGENTS.md 图片到 Lark...");
    const imageStream = fs.createReadStream(IMAGE_PATH);
    const stats = fs.statSync(IMAGE_PATH);
    console.log("图片大小:", stats.size, "字节 (", (stats.size / 1024).toFixed(2), "KB)");
    console.log("图片内容: AGENTS.md 文件全文");

    // 使用 image.create 上传
    const uploadResponse = await client.im.image.create({
      data: {
        image_type: "message",
        parent_type: "chat",
        parent_node: RECEIVE_ID,
        image: imageStream,
      },
    });

    console.log("上传响应:", uploadResponse);

    const imageKey = uploadResponse.image_key;
    console.log("图片 Key:", imageKey);

    if (!imageKey) {
      throw new Error("未获取到图片 Key");
    }

    // 步骤 2: 发送图片消息
    console.log("\n步骤 2: 发送图片消息到对话...");
    const sendResponse = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: RECEIVE_ID,
        msg_type: "image",
        content: JSON.stringify({
          image_key: imageKey,
        }),
      },
    });

    console.log("发送响应:", JSON.stringify(sendResponse, null, 2));

    if (sendResponse.code === 0) {
      console.log("\n✅ AGENTS.md 图片发送成功！");
      console.log("消息 ID:", sendResponse.data?.message_id);
      console.log("\n📄 请检查 Lark 对话中的 AGENTS.md 文件内容");
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

sendImage();
