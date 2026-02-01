import * as fs from "fs";
import { createCanvas, loadImage } from "canvas";

async function addTimestampToImage(inputPath, outputPath) {
  try {
    // 1. 加载原始图片
    console.log("步骤 1: 加载图片...");
    const image = await loadImage(inputPath);

    // 2. 创建画布
    console.log("步骤 2: 创建画布...");
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");

    // 3. 绘制原始图片
    console.log("步骤 3: 绘制原始图片...");
    ctx.drawImage(image, 0, 0);

    // 4. 添加日期水印
    console.log("步骤 4: 添加日期水印...");
    const now = new Date();
    const dateStr = now.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    console.log("日期时间:", dateStr);

    // 设置字体样式
    const fontSize = Math.max(24, Math.floor(image.width / 30));
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.lineWidth = 3;

    // 计算文本位置（右下角）
    const textMetrics = ctx.measureText(dateStr);
    const padding = 20;
    const x = image.width - textMetrics.width - padding;
    const y = image.height - padding;

    // 绘制文字阴影
    ctx.strokeText(dateStr, x, y);
    // 绘制文字
    ctx.fillText(dateStr, x, y);

    // 5. 保存图片
    console.log("步骤 5: 保存图片...");
    const out = fs.createWriteStream(outputPath);
    canvas.createPNGStream().pipe(out);

    await new Promise((resolve, reject) => {
      out.on("finish", resolve);
      out.on("error", reject);
    });

    console.log("✅ 图片已保存到:", outputPath);
    return true;
  } catch (error) {
    console.error("❌ 错误:", error.message);
    throw error;
  }
}

// 运行
const inputPath = "/tmp/baidu_new.png";
const outputPath = "/tmp/baidu_timestamped.png";

addTimestampToImage(inputPath, outputPath)
  .then(() => {
    console.log("\n完成！");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n失败:", error);
    process.exit(1);
  });
