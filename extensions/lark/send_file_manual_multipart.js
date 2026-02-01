import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";
import axios from "axios";

// 配置
const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const RECEIVE_ID = "oc_da77f70fbb70a836fcb385e1a2007094";
const FILE_PATH = "/tmp/AGENTS.txt";

async function sendFileViaResource() {
  try {
    // 步骤 1: 获取 token
    console.log("步骤 1: 获取访问令牌...");
    
    const client = new Lark.Client({
      appId: APP_ID,
      appSecret: APP_SECRET,
    });

    const tokenResponse = await axios.post(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        app_id: APP_ID,
        app_secret: APP_SECRET,
      }
    );

    if (tokenResponse.data.code !== 0) {
      throw new Error("获取 token 失败: " + tokenResponse.data.msg);
    }

    const token = tokenResponse.data.tenant_access_token;
    console.log("✅ Token 已获取");

    // 步骤 2: 上传文件到 im/resource
    console.log("\n步骤 2: 上传文件到 im/resource...");
    const fileStream = fs.createReadStream(FILE_PATH);
    const stats = fs.statSync(FILE_PATH);
    console.log("文件:", FILE_PATH);
    console.log("大小:", stats.size, "字节");

    // 使用 Buffer 而不是 Stream
    const fileBuffer = fs.readFileSync(FILE_PATH);

    // 构建 multipart/form-data
    const boundary = "----WebKitFormBoundary" + Date.now();
    let body = "";

    // 添加 file 字段
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="AGENTS.txt"\r\n`;
    body += `Content-Type: text/plain\r\n\r\n`;
    const filePart = Buffer.from(body, "utf-8");
    
    body = `\r\n--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file_type"\r\n\r\n`;
    body += `txt\r\n`;
    const typePart = Buffer.from(body, "utf-8");

    body = `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file_name"\r\n\r\n`;
    body += `AGENTS.txt\r\n`;
    const namePart = Buffer.from(body, "utf-8");

    const endPart = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");

    const fullBody = Buffer.concat([filePart, fileBuffer, typePart, namePart, endPart]);

    const uploadResponse = await axios.post(
      "https://open.feishu.cn/open-apis/im/v1/resources",
      fullBody,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
      }
    );

    console.log("上传响应:", JSON.stringify(uploadResponse.data, null, 2));

    if (uploadResponse.data.code !== 0) {
      throw new Error("上传失败: " + uploadResponse.data.msg);
    }

    const fileKey = uploadResponse.data.data.file_key;
    console.log("✅ 文件 Key:", fileKey);

    // 步骤 3: 发送文件消息
    console.log("\n步骤 3: 发送文件消息...");
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

sendFileViaResource();
