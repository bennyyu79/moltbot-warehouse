/**
 * 增强 Webhook 处理 - 添加图片和文件下载功能
 * 
 * 这是一个补丁文件，需要添加到 webhook.ts 中
 */

import * as fs from "fs";
import axios from "axios";
import {
  downloadLarkFile,
  extractImageKey,
  ensureDownloadDir
} from "./download.js";

/**
 * 获取 tenant_access_token
 */
async function getAccessToken(
  appId: string,
  appSecret: string
): Promise<string | null> {
  try {
    const response = await axios.post(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        app_id: appId,
        app_secret: appSecret,
      }
    );

    if (response.data.code === 0) {
      return response.data.tenant_access_token;
    }

    return null;
  } catch (error) {
    console.error("[lark-webhook] Failed to get access token:", error);
    return null;
  }
}

/**
 * 处理接收到的图片/文件消息
 */
export async function handleReceivedFile(
  message: any,
  account: any,
  api: any
): Promise<string | null> {
  try {
    const { message_type, content } = message;
    
    // 提取文件 key
    const fileKey = extractImageKey(content, message_type);
    
    if (!fileKey) {
      console.log("[lark-webhook] No file key found in message");
      return null;
    }

    api.logger.info(`[lark-webhook] Received file with key: ${fileKey}`);

    // 获取 access token
    const token = await getAccessToken(account.appId, account.appSecret);
    
    if (!token) {
      api.logger.error("[lark-webhook] Failed to get access token for file download");
      return null;
    }

    // 确保下载目录存在
    const downloadDir = ensureDownloadDir("/tmp");

    // 确定域名
    const apiDomain = account.domain === "feishu" 
      ? "https://open.feishu.cn" 
      : "https://open.larksuite.com";

    // 下载文件
    const filepath = await downloadLarkFile(
      fileKey,
      token,
      downloadDir,
      apiDomain
    );

    if (filepath) {
      api.logger.info(`[lark-webhook] File saved to: ${filepath}`);
      return filepath;
    } else {
      api.logger.error("[lark-webhook] File download failed");
      return null;
    }
  } catch (error) {
    api.logger.error(`[lark-webhook] Error handling received file: ${error}`);
    return null;
  }
}

/**
 * 修改后的 routeMessage 函数 - 需要替换 webhook.ts 中的 routeMessage 函数
 */
export async function routeMessageWithDownload(
  event: any,
  account: any
): Promise<void> {
  const api = getLarkRuntime();
  const core = api.runtime;
  const cfg = api.config;
  const { message, sender } = event;

  // 检查是否是图片或文件消息
  if (message.message_type === "image" || message.message_type === "file") {
    const filepath = await handleReceivedFile(message, account, api);
    
    if (filepath) {
      // 将文件路径添加到消息内容中
      const fileMsg = `[已接收文件: ${filepath}]`;
      
      // 继续处理消息，但带上文件路径信息
      const senderId = sender.sender_id.open_id;
      const chatId = message.chat_id;
      const isGroup = message.chat_type === "group";

      api.logger.info(
        `[lark-webhook] File message from ${senderId} in ${chatId}, saved to ${filepath}`
      );

      // 构建上下文
      const larkFrom = `lark:${account.accountId}:${senderId}`;
      const larkTo = `lark:${account.accountId}:${chatId}`;

      const route = await core.channel.routing.resolveAgentRoute({
        cfg,
        channel: "lark",
        accountId: account.accountId,
        chatType: isGroup ? "group" : "direct",
        chatId,
        senderId,
      });

      if (!route) {
        api.logger.warn("[lark-webhook] No route found for file message");
        return;
      }

      // 创建包含文件路径的上下文
      const ctxPayload = core.channel.reply.finalizeInboundContext({
        Body: fileMsg,
        RawBody: fileMsg,
        CommandBody: fileMsg,
        From: larkFrom,
        To: larkTo,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: isGroup ? "group" : "direct",
        GroupSubject: isGroup ? chatId : undefined,
        SenderName: senderId,
        SenderId: senderId,
        Provider: "lark",
        Surface: "lark",
        MessageSid: message.message_id,
        Timestamp: Date.now(),
        WasMentioned: false,
        CommandAuthorized: true,
        OriginatingChannel: "lark",
        OriginatingTo: larkTo,
        // 添加文件路径
        FilePath: filepath,
        FileType: message.message_type,
      });

      // 调用 agent 处理
      await core.channel.inbound(ctxPayload);

      return;
    }
  }

  // 如果不是文件消息，继续原有的文本处理逻辑
  // ... (原有的 routeMessage 代码)
}
