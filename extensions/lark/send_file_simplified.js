import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";

// 配置
const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const RECEIVE_ID = "oc_da77f70fbb70a836fcb385e1a2007094";
const FILE_PATH = "/tmp/AGENTS.txt";

// 创建客户端
const client = new Lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
});

async function sendFileWithoutParent() {
  try {
    console.log("尝试不指定 parent_node...");
    
    const fileStream = fs.createReadStream(FILE_PATH);
    const stats = fs.statSync(FILE_PATH);
    console.log("文件:", FILE_PATH);
    console.log("大小:", stats.size, "字节");

    // 不指定 parent_type 和 parent_node，只传文件
    const uploadResponse = await client.im.file.create({
      data: {
        file: fileStream,
      },
    });

    console.log("上传响应:", JSON.stringify(uploadResponse, null, 2));

    const fileKey = uploadResponse.file_key || uploadResponse.data?.file_key;
    console.log("文件 Key:", fileKey);

    if (!fileKey) {
      throw new Error("未获取到 file_key");
    }

    console.log("\n发送文件消息...");
    const sendResponse = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: RECEIVE_ID,
        msg_type: "file",
        content: JSON.stringify({
          file_key: fileKey,
        }),
      },
    });

    console.log("发送响应:", JSON.stringify(sendResponse, null, 2));

    if (sendResponse.code === 0) {
      console.log("\n✅ 文件发送成功！");
      console.log("消息 ID:", sendResponse.data?.message_id);
      console.log("\n📎 请查看 Lark 对话中的文件附件");
    } else {
      console.error("\n❌ 发送失败:", sendResponse.msg);
    }
  } catch (error) {
    console.error("\n❌ 错误:");
    console.error(error.message);
    if (error.response?.data) {
      console.error("详细:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

sendFileWithoutParent();
