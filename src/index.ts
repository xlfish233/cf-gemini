import { Hono } from "hono";
import { TimeoutMiddleware } from "./middlewares/timeout";
import { AuthMiddleware } from "./middlewares/auth";
import { DbPrismaD1Service } from './db/service'; // Import DB service
import { IDatabaseService } from './db/interface'; // Import DB interface
import { ProxyHandler } from './router/proxy';     // Import Proxy handler
import keysRouter from './router/keys';        // Import Keys router
import type { D1Database } from '@cloudflare/workers-types'; // Import D1 type

// Define types for Hono Context
type Bindings = {
  DB: D1Database; // D1 binding from wrangler.toml
  API_AUTH_KEY: string;
  TARGET_API_HOST?: string; // Optional target host for proxy
  // Add other bindings as needed
};
type Variables = {
  dbService: IDatabaseService; // To store the db service instance
};

// Instantiate Hono with types
const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

// 应用超时中间件到所有路由
app.use("*", TimeoutMiddleware);

// 应用鉴权中间件
app.use("*", async (c, next) => {
  const authKey = c.env.API_AUTH_KEY; // 从环境变量获取 Key
  if (!authKey) {
    console.error("Error: API_AUTH_KEY environment variable is not set.");
    // 返回错误或采取其他措施，取决于你的安全需求
    return c.text("Internal Server Error - Auth Key Missing", { status: 500 });
  }
  // 执行 AuthMiddleware
  return AuthMiddleware(authKey)(c, next);
});

// Middleware to initialize and inject DbService
app.use('*', async (c, next) => {
  if (!c.var.dbService) { // Create only if it doesn't exist for this request
    try {
      const dbServiceInstance = new DbPrismaD1Service(c.env.DB);
      c.set('dbService', dbServiceInstance);
      console.log("DbService initialized and attached to context.");
    } catch (error) {
        console.error("Failed to initialize DbService:", error);
        return c.text("Internal Server Error - DB Initialization Failed", { status: 500 });
    }
  }
  await next();
});


// Mount the keys router under the /keys path
app.route('/keys', keysRouter);

// Catch-all proxy handler (MUST be after specific routes)
app.all('/*', ProxyHandler);
app.all('/*', ProxyHandler);


export default app;
