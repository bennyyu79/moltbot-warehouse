/**
 * Lark Webhook Server - Enhanced with File Download Support
 *
 * Enhanced version with automatic image and file download functionality
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import * as fs from "fs";

import { getLarkRuntime } from "./runtime.js";
import type { ResolvedLarkAccount, LarkMessageEvent } from "./types.js";

const DEFAULT_PORT = 3000;
const RESTART_DELAY_MS = 3000;
const MAX_RESTART_ATTEMPTS = 5;

interface WebhookServer {
  server: http.Server | null;
  port: number;
  stop: () => void;
}

/**
 * Decrypt AES-256-CBC encrypted event data from Lark.
 */
function decryptEvent(encrypted: string, encryptKey: string): string {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const encryptedBuffer = Buffer.from(encrypted, "base64");
  const iv = encryptedBuffer.subarray(0, 16);
  const ciphertext = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Parse request body as JSON.
 */
async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Extract plain text from Lark message content.
 */
function extractText(content: string, messageType: string): string {
  try {
    const parsed = JSON.parse(content);
    if (messageType === "text") {
      return parsed.text ?? "";
    }
    if (messageType === "post") {
      if (Array.isArray(parsed.content)) {
        return parsed.content
          .flat()
          .filter((item: { tag: string }) => item.tag === "text")
          .map((item: { text: string }) => item.text)
          .join("");
      }
      return parsed.title ?? "";
    }
    return `[${messageType} message]`;
  } catch {
    return content;
  }
}

/**
 * Route incoming message to clawdbot handler - ENHANCED with file download
 */
async function routeMessage(
  event: LarkMessageEvent,
  account: ResolvedLarkAccount
): Promise<void> {
  const api = getLarkRuntime();
  const core = api.runtime;
  const cfg = api.config;
  const { message, sender } = event;

  // === NEW: Handle images and files ===
  if (message.message_type === "image" || message.message_type === "file") {
    try {
      // Extract file key
      let fileKey = null;
      try {
        const content = JSON.parse(message.content);
        fileKey = message.message_type === "image" ? content.image_key : content.file_key;
      } catch (e) {
        api.logger.error("[lark-webhook] Failed to parse message content");
        return;
      }

      if (!fileKey) {
        api.logger.warn("[lark-webhook] No file key found");
        return;
      }

      api.logger.info(`[lark-webhook] Received file: ${fileKey}`);

      // Get tenant access token
      const axios = (await import("axios")).default;
      const tokenResp = await axios.post(
        account.domain === "feishu" 
          ? "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
          : "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
        {
          app_id: account.appId,
          app_secret: account.appSecret,
        }
      );

      if (tokenResp.data.code !== 0) {
        api.logger.error("[lark-webhook] Failed to get access token");
        return;
      }

      const token = tokenResp.data.tenant_access_token;
      
      // Download file
      const downloadUrl = `${account.domain === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com"}/open-apis/drive/v1/medias/${fileKey}/download/?access_token=${token}`;
      
      const fileResp = await axios.get(downloadUrl, {
        responseType: "arraybuffer"
      });

      // Determine file extension
      let ext = message.message_type === "image" ? ".png" : ".file";
      const timestamp = Date.now();
      const filename = `lark_${timestamp}_${fileKey.substring(0, 8)}${ext}`;
      
      // Ensure download directory exists
      const downloadDir = "/tmp/lark_downloads";
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      
      const filepath = `${downloadDir}/${filename}`;
      fs.writeFileSync(filepath, Buffer.from(fileResp.data));

      api.logger.info(`[lark-webhook] File saved: ${filepath}`);

      // Build file message
      const fileMsg = `[已接收${message.message_type === "image" ? "图片" : "文件"}: ${filepath}]`;

      // Continue with original message processing flow
      const senderId = sender.sender_id.open_id;
      const chatId = message.chat_id;
      const isGroup = message.chat_type === "group";

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

      // Create context with file path
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
        // Add file-related fields
        FilePath: filepath,
        FileType: message.message_type,
        FileKey: fileKey,
      });

      // Invoke agent
      await core.channel.inbound(ctxPayload);
      return;

    } catch (error) {
      api.logger.error(`[lark-webhook] Error handling file: ${error}`);
      return;
    }
  }

  // === Original text message handling ===
  const text = extractText(message.content, message.message_type);

  if (!text.trim()) {
    return;
  }

  const senderId = sender.sender_id.open_id;
  const chatId = message.chat_id;
  const isGroup = message.chat_type === "group";

  api.logger.info(
    `[lark-webhook] Message from ${senderId} in ${message.chat_type} ${chatId}`
  );

  // Build Lark-specific identifiers
  const larkFrom = `lark:${account.accountId}:${senderId}`;
  const larkTo = `lark:${account.accountId}:${chatId}`;

  // Resolve routing to find the agent
  const route = await core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "lark",
    accountId: account.accountId,
    chatType: isGroup ? "group" : "direct",
    chatId,
    senderId,
  });

  if (!route) {
    api.logger.warn("[lark-webhook] No route found for message");
    return;
  }

  // Finalize inbound context
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: text,
    RawBody: text,
    CommandBody: text,
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
  });

  // Create a dispatcher that sends replies back to Lark
  const { createLarkClient } = await import("./client.js");
  const client = createLarkClient(account);
  const receiveIdType = chatId.startsWith("oc_") ? "chat_id" : "open_id";

  const dispatcher = {
    async sendBlockReply(block: Record<string, unknown>) {
      // Handle image/media
      const imagePath = (block.mediaUrl || block.media || block.image) as string | undefined;
      if (imagePath && fs.existsSync(imagePath)) {
        try {
          // Upload image to Lark
          const uploadResp = await client.im.image.create({
            data: {
              image_type: "message",
              image: fs.createReadStream(imagePath),
            },
          });

          // Handle both response formats
          const imageKey = (uploadResp as any).image_key || uploadResp.data?.image_key;

          if (imageKey) {
            await client.im.message.create({
              params: { receive_id_type: receiveIdType },
              data: {
                receive_id: chatId,
                msg_type: "image",
                content: JSON.stringify({ image_key: imageKey }),
              },
            });
            return;
          } else {
            api.logger.error(`[lark-webhook] Image upload failed: ${JSON.stringify(uploadResp)}`);
          }
        } catch (err) {
          api.logger.error(`[lark-webhook] Image upload error: ${err}`);
        }
      }

      // Handle text
      const replyText = (block.markdown || block.text || "") as string;
      if (!replyText.trim()) return;

      await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text: replyText }),
        },
      });
    },
    async sendFinalReply(block: Record<string, unknown>) {
      // Final reply uses the same logic as block reply for Lark
      await dispatcher.sendBlockReply(block);
    },
  };

  // Hand off to Clawdbot runtime
  await core.channel.inboundWithContext(ctxPayload, dispatcher);
}

// ... rest of the file remains the same
