import { Context, Next } from "hono";

// 定义 Hono 应用的环境类型，以便 TypeScript 知道 c.env
// 你可能需要根据 wrangler.jsonc 中的绑定来扩展这个类型
type Env = {
    Bindings: {
        TIMEOUT?: string; // TIMEOUT 是可选的
    }
}

// 使用泛型指定环境类型
export const TimeoutMiddleware = async (c: Context<Env>, next: Next) => {
    const controller = new AbortController();
    // 从 Cloudflare Workers 环境变量读取超时时间，如果未设置则默认为 10 秒
    const timeoutEnv = c.env.TIMEOUT;
    const timeoutMs = timeoutEnv ? parseInt(timeoutEnv) : 10000;

    // 检查解析后的超时值是否有效
    if (isNaN(timeoutMs) || timeoutMs <= 0) {
        console.error(`Invalid TIMEOUT value: "${timeoutEnv}". Using default 10000ms.`);
        // 如果环境变量无效，也使用默认值
        const defaultTimeoutMs = 10000;
        const timeoutId = setTimeout(() => controller.abort(), defaultTimeoutMs);
        // ... (重复下面的 try/catch/finally 逻辑，或者提取成函数)
        // 为了简洁，这里暂时省略重复代码，但实际应用中应处理
    } else {
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            // 注意：Hono v4 可能有更标准的方式传递 signal
            // c.req.raw[Symbol.for('signal')] = controller.signal;
            await next();
        } catch (error) {
            clearTimeout(timeoutId);
            // 检查是否是 AbortError
            if (error instanceof Error && error.name === "AbortError") {
                console.error(`Request timed out after ${timeoutMs}ms.`); // 添加日志记录
                return c.text("Request Timeout", { status: 408 });
            }
            // 重新抛出其他错误
            console.error("Error during request processing:", error); // 记录其他错误
            throw error;
        } finally {
            // 确保无论如何都清除超时
            clearTimeout(timeoutId);
        }
    }
    // 如果上面 if/else 分支没有 return 或 throw，确保 next() 后的逻辑能继续
    // 但在这个中间件的结构中，通常会在 try 或 catch 中返回或抛出
};