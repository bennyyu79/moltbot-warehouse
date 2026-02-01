/**
 * Lark Webhook Server
 *
 * Standalone HTTP server for receiving Lark webhook callbacks.
 * Used for individual accounts that don't support WebSocket.
 * Includes automatic crash recovery.
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import * as fs from "node:fs";

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
 * For images/files, download and return the file path.
 */
async function extractTextWithMedia(
  content: string,
  messageType: string,
  messageId: string,
  account: ResolvedLarkAccount
): Promise<string> {
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
    // For images and files, download using messageResource API
    if (messageType === "image" || messageType === "file") {
      const fileKey = messageType === "image" ? parsed.image_key : parsed.file_key;
      if (!fileKey) {
        return `[${messageType} message]`;
      }

      console.log(`[lark-webhook] Downloading ${messageType}: ${fileKey} from message ${messageId}`);

      try {
        const { createLarkClient } = await import("./client.js");
        const client = createLarkClient(account);

        console.log(`[lark-webhook] Client created, calling messageResource.get...`);

        // Use messageResource API (not drive.media API!)
        const response = await client.im.messageResource.get({
          path: {
            message_id: messageId,
            file_key: fileKey,
          },
          params: {
            type: messageType,
          },
        });

        console.log(`[lark-webhook] Response received, type:`, typeof response);

        // Handle response
        let buffer: Buffer | null = null;
        const responseAny = response as any;

        if (Buffer.isBuffer(response)) {
          buffer = response;
        } else if (response instanceof ArrayBuffer) {
          buffer = Buffer.from(response);
        } else if (responseAny.data && Buffer.isBuffer(responseAny.data)) {
          buffer = responseAny.data;
        } else if (typeof responseAny.getReadableStream === "function") {
          const stream = responseAny.getReadableStream();
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          buffer = Buffer.concat(chunks);
        } else if (typeof responseAny[Symbol.asyncIterator] === "function") {
          const chunks: Buffer[] = [];
          for await (const chunk of responseAny) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          buffer = Buffer.concat(chunks);
        }

        if (buffer && buffer.length > 0) {
          // Save to temp directory
          const downloadDir = "/tmp/lark_downloads";
          if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
          }

          // Detect file extension
          let ext = messageType === "image" ? ".png" : ".file";

          // Try to detect actual file type from buffer
          if (messageType === "file") {
            const header = buffer.slice(0, 8).toString('hex');
            // PDF: %PDF (25 50 44 46)
            if (header.startsWith('25504446')) {
              ext = ".pdf";
            }
            // ZIP: PK (50 4B 03 04 or 50 4B 05 06)
            else if (header.startsWith('504b0304') || header.startsWith('504b0506')) {
              ext = ".zip";
            }
            // Office docs (docx/xlsx/pptx are also ZIP)
            // Detect by header or extension if available
          }

          const timestamp = Date.now();
          const filename = `lark_${timestamp}_${fileKey.substring(0, 8)}${ext}`;
          const filepath = `${downloadDir}/${filename}`;

          fs.writeFileSync(filepath, buffer);

          return `[已接收${messageType === "image" ? "图片" : "文件"}: ${filepath}]`;
        }

        // Fallback if download failed
        return `[📷 ${messageType}: ${fileKey}]`;

      } catch (error) {
        // If download fails, return the key reference
        console.error(`[lark-webhook] Failed to download ${messageType}:`, error);
        return `[📷 ${messageType}: ${fileKey}]`;
      }
    }
    return `[${messageType} message]`;
  } catch {
    return content;
  }
}

/**
 * Route incoming message to clawdbot handler.
 */
async function routeMessage(
  event: LarkMessageEvent,
  account: ResolvedLarkAccount
): Promise<void> {
  const api = getLarkRuntime();
  const core = api.runtime;
  const cfg = api.config;
  const { message, sender } = event;

  // Extract text and download media if present
  const text = await extractTextWithMedia(
    message.content,
    message.message_type,
    message.message_id,
    account
  );

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
    async waitForIdle() {
      // No buffering, messages sent immediately
    },
    getQueuedCounts() {
      return { blocks: 0, chars: 0 };
    },
  };

  // Dispatch the message to the agent
  await core.channel.reply.dispatchReplyFromConfig({
    ctx: ctxPayload,
    cfg,
    dispatcher,
    replyOptions: {
      agentId: route.agentId,
      channel: "lark",
      accountId: account.accountId,
    },
  });
}

/**
 * Handle incoming webhook request.
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  account: ResolvedLarkAccount
): Promise<void> {
  const api = getLarkRuntime();

  // Only accept POST requests
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  try {
    let body = (await parseBody(req)) as Record<string, unknown>;

    // Handle encrypted events
    if (body.encrypt && account.encryptKey) {
      const decrypted = decryptEvent(body.encrypt as string, account.encryptKey);
      body = JSON.parse(decrypted);
    }

    // URL verification challenge
    if (body.type === "url_verification") {
      api.logger.info("[lark-webhook] URL verification received");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ challenge: body.challenge }));
      return;
    }

    // Handle event callback
    if (body.header && body.event) {
      const header = body.header as { event_type: string };
      const event = body.event as LarkMessageEvent;

      if (header.event_type === "im.message.receive_v1") {
        // Process message asynchronously to not block webhook response
        routeMessage(event, account).catch((err) => {
          api.logger.error(`[lark-webhook] Message routing error: ${err}`);
        });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0 }));
      return;
    }

    // Unknown request format
    res.writeHead(200);
    res.end("OK");
  } catch (error) {
    api.logger.error(`[lark-webhook] Request error: ${error}`);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

/**
 * Start the webhook server with automatic crash recovery.
 */
export function startWebhookServer(
  account: ResolvedLarkAccount,
  port: number = DEFAULT_PORT
): WebhookServer {
  const api = getLarkRuntime();
  let server: http.Server | null = null;
  let restartAttempts = 0;
  let stopped = false;

  function createServer(): http.Server {
    const srv = http.createServer((req, res) => {
      handleRequest(req, res, account).catch((err) => {
        api.logger.error(`[lark-webhook] Unhandled error: ${err}`);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      });
    });

    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        api.logger.error(`[lark-webhook] Port ${port} already in use`);
        return;
      }
      api.logger.error(`[lark-webhook] Server error: ${err.message}`);
      scheduleRestart();
    });

    srv.on("close", () => {
      if (!stopped) {
        api.logger.warn("[lark-webhook] Server closed unexpectedly");
        scheduleRestart();
      }
    });

    return srv;
  }

  function scheduleRestart() {
    if (stopped) return;

    restartAttempts++;
    if (restartAttempts > MAX_RESTART_ATTEMPTS) {
      api.logger.error(
        `[lark-webhook] Max restart attempts (${MAX_RESTART_ATTEMPTS}) exceeded, giving up`
      );
      return;
    }

    api.logger.info(
      `[lark-webhook] Restarting in ${RESTART_DELAY_MS}ms (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`
    );

    setTimeout(() => {
      if (stopped) return;
      try {
        server = createServer();
        server.listen(port, () => {
          api.logger.info(`[lark-webhook] Server restarted on port ${port}`);
          restartAttempts = 0; // Reset on successful restart
        });
      } catch (err) {
        api.logger.error(`[lark-webhook] Restart failed: ${err}`);
        scheduleRestart();
      }
    }, RESTART_DELAY_MS);
  }

  // Initial server start
  server = createServer();
  server.listen(port, () => {
    api.logger.info(`[lark-webhook] Server listening on port ${port}`);
  });

  return {
    get server() {
      return server;
    },
    port,
    stop: () => {
      stopped = true;
      if (server) {
        server.close();
        server = null;
      }
      api.logger.info("[lark-webhook] Server stopped");
    },
  };
}
