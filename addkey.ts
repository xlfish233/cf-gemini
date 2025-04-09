// 移除了未使用的 import { $ } from 'bun';

// --- 配置 ---
// 从环境变量读取 API 地址和认证 Token
// 你需要在运行脚本前设置这些环境变量
// 例如: export API_BASE_URL="https://your-worker-url.workers.dev"
//       export API_AUTH_KEY="your_secret_auth_token"
// 或者在 .env 文件中定义，Bun 会自动加载
const baseUrl = process.env.API_BASE_URL || ""; // 优先使用环境变量，否则使用默认值
const authToken = process.env.API_AUTH_KEY || "";
const keysFilePath = "./keys.csv"; // Key 文件路径

// --- 检查配置 ---
if (!authToken) {
  console.error("错误：请设置 API_AUTH_KEY 环境变量。");
  process.exit(1); // 退出脚本
}

console.log(`将使用以下配置导入 Keys:`);
console.log(`  API Base URL: ${baseUrl}`);
console.log(`  Keys 文件路径: ${keysFilePath}`);
console.log(`  Auth Token: ${authToken ? "已设置" : "未设置"}`); // 不直接打印 token

// --- 主函数 ---
async function batchAddKeys() {
  console.log(`\n开始从 ${keysFilePath} 读取 API Keys...`);

  try {
    const file = Bun.file(keysFilePath);
    if (!(await file.exists())) {
      console.error(`错误: 文件 ${keysFilePath} 不存在。`);
      process.exit(1);
    }

    const content = await file.text();
    const keys = content.split("\n")
      .map((key: string) => key.trim()) // 添加显式类型 string
      .filter((key: string) => key.length > 0); // 添加显式类型 string

    if (keys.length === 0) {
      console.log("文件中没有找到有效的 API Keys。");
      return;
    }

    console.log(`找到 ${keys.length} 个 Keys，开始逐个导入...`);

    let successCount = 0;
    let failureCount = 0;

    for (const apiKey of keys) {
      // 只显示部分 Key 以保护隐私，避免日志泄露完整 Key
      const maskedKey = `${apiKey.substring(0, 4)}...${
        apiKey.substring(apiKey.length - 4)
      }`;
      console.log(`  正在导入 Key: ${maskedKey}`);
      try {
        const response = await fetch(`${baseUrl}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": authToken, // 使用从环境变量获取的 Token
          },
          body: JSON.stringify({ api_key: apiKey }),
        });

        if (response.ok) {
          // 尝试解析 JSON，如果 API 不返回 JSON 或返回空，则优雅处理
          let resultText = await response.text();
          try {
            const resultJson = JSON.parse(resultText);
            console.log(
              `    ✅ 成功: ${maskedKey} - ${JSON.stringify(resultJson)}`,
            );
          } catch (e) {
            // 如果解析失败，可能 API 返回了非 JSON 文本或空响应
            console.log(
              `    ✅ 成功: ${maskedKey} - 状态码: ${response.status}${
                resultText ? `, 响应: ${resultText}` : ""
              }`,
            );
          }
          successCount++;
        } else {
          const errorText = await response.text();
          console.error(
            `    ❌ 失败: ${maskedKey} - 状态码: ${response.status}, 错误: ${errorText}`,
          );
          // exit 1
          process.exit(1);
          failureCount++;
        }
      } catch (error) {
        console.error(`    ❌ 导入 ${maskedKey} 时发生网络或请求错误:`, error);
        failureCount++;
      }
      // 可以选择性地添加延迟，避免请求过于频繁
      // await Bun.sleep(100); // 暂停 100 毫秒
    }

    console.log("\n--- 导入完成 ---");
    console.log(`成功: ${successCount}`);
    console.log(`失败: ${failureCount}`);
  } catch (error) {
    console.error(`读取或处理文件 ${keysFilePath} 时出错:`, error);
    process.exit(1);
  }
}

// --- 执行 ---
batchAddKeys();
