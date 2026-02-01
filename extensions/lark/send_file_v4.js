import * as Lark from "@larksuiteoapi/node-sdk";
import * as fs from "fs";
import * as FormData from "form-data";

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
    // 步骤 1: 上传文件 - 直接使用 HTTP POST
    console.log("步骤 1: 上传文件到 Lark...");
    const fileStream = fs.createReadStream(FILE_PATH);
    const stats = fs.statSync(FILE_PATH);
    console.log("文件路径:", FILE_PATH);
    console.log("文件大小:", stats.size, "字节 (", (stats.size / 1024).toFixed(2), "KB)");
    console.log("文件名: AGENTS.md");

    // 构建表单数据
    const form = new FormData();
    form.append("file_name", "AGENTS.md");
    form.append("parent_type", "chat");
    form.append("parent_node", RECEIVE_ID);
    form.append("file", fileStream);

    // 获取 tenant_access_token
    const authResponse = await client.auth.tenantAccessToken.internalGet({
      data: {
        app_id: APP_ID,
        app_secret: APP_SECRET,
      },
    });

    console.log("认证响应:", JSON.stringify(authResponse, null, 2));

    if (authResponse.code !== 0) {
      throw new Error("获取 token 失败");
    }

    const token = authResponse.tenant_access_token;
    console.log("Token:", token ? "已获取" : "未获取");

    // 手动上传文件
    const axios = (await import("axios")).default;
    const uploadResponse = await axios.post(
      "https://open.feishu.cn/open-apis/im/v1/files",
      form,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...form.getHeaders(),
        },
      }
    );

    console.log("上传响应:", JSON.stringify(uploadResponse.data, null, 2));

    const fileKey = uploadResponse.data.data.file_key;
    console.log("文件 Key:", fileKey);

    if (!fileKey) {
      throw new Error("未获取到文件 Key");
    }

    // 步骤 2: 发送文件消息
    console.log("\n步骤 2: 发送文件消息到对话...");
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
      console.log("\n✅ AGENTS.md 文件发送成功！");
      console.log("消息 ID:", sendResponse.data?.message_id);
      console.log("\n📄 请检查 Lark 对话中的文件");
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
