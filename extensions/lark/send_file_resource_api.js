import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";
import axios from "axios";
import * as FormData from "form-data";

// 配置
const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const RECEIVE_ID = "oc_da77f70fbb70a836fcb385e1a2007094";
const FILE_PATH = "/tmp/AGENTS.txt";

async function sendFileViaAPI() {
  try {
    // 步骤 1: 获取 tenant_access_token
    console.log("步骤 1: 获取访问令牌...");
    
    const client = new Lark.Client({
      appId: APP_ID,
      appSecret: APP_SECRET,
    });

    // 使用 client.auth 获取 token
    const tokenResponse = await axios.post(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        app_id: APP_ID,
        app_secret: APP_SECRET,
      }
    );

    console.log("Token 响应:", JSON.stringify(tokenResponse.data, null, 2));

    if (tokenResponse.data.code !== 0) {
      throw new Error("获取 token 失败: " + tokenResponse.data.msg);
    }

    const token = tokenResponse.data.tenant_access_token;
    console.log("✅ Token 已获取");

    // 步骤 2: 上传文件
    console.log("\n步骤 2: 上传文件到 im/resource...");
    const fileStream = fs.createReadStream(FILE_PATH);
    const stats = fs.statSync(FILE_PATH);
    console.log("文件:", FILE_PATH);
    console.log("大小:", stats.size, "字节");

    const form = new FormData();
    form.append("file", fileStream, {
      filename: "AGENTS.txt",
      contentType: "text/plain",
    });
    form.append("file_type", "txt");
    form.append("file_name", "AGENTS.txt");

    const uploadResponse = await axios.post(
      "https://open.feishu.cn/open-apis/im/v1/resources",
      form,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          ...form.getHeaders(),
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

sendFileViaAPI();
