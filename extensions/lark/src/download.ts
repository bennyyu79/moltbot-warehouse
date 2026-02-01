/**
 * Download images and files from Lark messages
 */

import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

/**
 * Download a file from Lark URL and save to local directory
 */
export async function downloadLarkFile(
  fileKey: string,
  accessToken: string,
  saveDir: string,
  apiDomain: string = "https://open.feishu.cn"
): Promise<string | null> {
  try {
    // Construct file download URL
    const downloadUrl = `${apiDomain}/open-apis/drive/v1/medias/${fileKey}/download/?access_token=${accessToken}`;

    // Download file
    const fileData = await downloadFile(downloadUrl);

    // Determine file extension
    let ext = ".unknown";
    if (fileKey.startsWith("img_")) {
      ext = ".png";
    } else if (fileKey.startsWith("file_")) {
      ext = ".download";
    }

    // Generate filename
    const timestamp = Date.now();
    const filename = `lark_${timestamp}_${fileKey.substring(0, 8)}${ext}`;
    const filepath = path.join(saveDir, filename);

    // Save file
    fs.writeFileSync(filepath, fileData);

    return filepath;
  } catch (error) {
    console.error(`[lark-download] Failed to download file ${fileKey}:`, error);
    return null;
  }
}

/**
 * Download file from URL
 */
async function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    protocol.get(url, (res) => {
      const chunks: Buffer[] = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      res.on("error", reject);
    }).on("error", reject);
  });
}

/**
 * Extract image_key from Lark message content
 */
export function extractImageKey(content: string, messageType: string): string | null {
  try {
    const parsed = JSON.parse(content);
    
    if (messageType === "image") {
      return parsed.image_key || null;
    }
    
    if (messageType === "file") {
      return parsed.file_key || null;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Ensure download directory exists
 */
export function ensureDownloadDir(baseDir: string = "/tmp"): string {
  const downloadDir = path.join(baseDir, "lark_downloads");
  
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  
  return downloadDir;
}
