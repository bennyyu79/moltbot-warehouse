#!/usr/bin/env node
/**
 * 使用飞书官方 SDK 测试图片下载
 */

const { API } = require('@larksuiteoapi/node-sdk');

const APP_ID = "cli_a9f4ba761ef8dbb4";
const APP_SECRET = "yv3jn1eeIMqqt2uJ65GY5dqRA0Tky2WH";
const IMAGE_KEY = "img_v3_02ug_edf30feb-f329-4cff-8a17-cd367dfd2bfg";

async function testWithSDK() {
  try {
    console.log("使用飞书官方 SDK 测试...\n");

    // 创建客户端
    const client = new API({
      appId: APP_ID,
      appSecret: APP_SECRET,
    });

    console.log("测试 1: 获取图片资源");
    try {
      const response = await requestWithTimeout(
        client.drive.media.downloadAll({
          params: {
            file_key: IMAGE_KEY,
          },
          headers: {
            'Authorization': `Bearer ${await client.auth.getTenantAccessToken()}` // 手动添加 token
          }
        }),
        5000
      );
      
      console.log("✅ 成功!");
      console.log("Response:", response);
    } catch (error) {
      console.log("❌ 失败:", error.message);
      if (error.code) console.log("Error code:", error.code);
    }

    console.log("\n测试 2: 直接使用 API 调用");
    try {
      const token = await client.auth.internalGetTenantAccessToken({});
      console.log("Token:", token.tenant_access_token);
      
      // SDK 的内部实现
      const response = await client.im.v1.message.get({
        path: {
          message_id: IMAGE_KEY, // 尝试用图片 key 获取消息
        },
      });
      
      console.log("✅ 成功!");
      console.log("Response:", response);
    } catch (error) {
      console.log("❌ 失败:", error.message);
    }

  } catch (error) {
    console.error("测试失败:", error);
  }
}

function requestWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout after ' + ms + ' ms')), ms)
    )
  ]);
}

testWithSDK();
