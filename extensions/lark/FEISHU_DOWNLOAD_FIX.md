# 飞书文件下载功能修复总结

## 问题描述

飞书 webhook 能正常接收图片和文件消息，但所有下载尝试都返回 404 错误。

## 根本原因

使用了错误的 API 端点：
- ❌ **错误**: `drive.v1.medias.download` - 这个 API 用于云盘文件，不适用于消息附件
- ✅ **正确**: `im.messageResource.get` - 专门用于下载消息中的附件

## 解决方案

### 1. 使用正确的 API

```typescript
await client.im.messageResource.get({
  path: {
    message_id: messageId,  // 消息 ID
    file_key: fileKey,      // 图片或文件的 key
  },
  params: {
    type: "image" | "file"  // 类型
  }
})
```

### 2. 添加文件类型检测

根据文件内容的魔数自动检测文件类型并设置正确的扩展名：
- PDF 文件 → `.pdf`
- ZIP 文件 → `.zip`
- Office 文档 → `.zip` (docx/xlsx/pptx 实际上就是 ZIP 格式)

### 3. 关键代码修改

- 将 `extractText` 函数改为异步函数 `extractTextWithMedia`
- 使用 `messageResource` API 下载图片和文件
- 保存到 `/tmp/lark_downloads/` 目录
- 返回文件路径给 AI 处理

## 测试结果

✅ **图片下载** - 成功下载 PNG/JPG 等图片格式
✅ **PDF 文件** - 成功下载并识别 PDF 文件
✅ **文件上传** - 成功将本地图片上传到飞书

## 参考

参考了 `@m1heng-clawd/feishu` 插件的实现，该插件使用正确的 API 处理消息附件。

关键注释：
```typescript
// For message media, always use messageResource API
// The image.get API is only for images uploaded via im/v1/images, not for message attachments
```

## 影响范围

- `src/webhook.ts` - 主要修改
- 支持图片和文件的自动下载
- AI 可以直接处理接收到的文件
