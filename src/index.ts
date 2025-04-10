import { Hono } from "hono";
import { TimeoutMiddleware } from "./middlewares/timeout";
import { AuthMiddleware } from "./middlewares/auth";
import { DbPrismaD1Service } from "./db/service";
import { IDatabaseService } from "./db/interface";
import { ProxyHandler } from "./router/proxy";
import keysRouter from "./router/keys";
import type { D1Database } from "@cloudflare/workers-types";

type Bindings = {
  DB: D1Database;
  API_AUTH_KEY: string;
  TARGET_API_HOST?: string;
};
type Variables = {
  dbService: IDatabaseService;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

let dbServiceInstance: IDatabaseService | null = null;
let dbInitializationError: Error | null = null;

app.use("*", async (c, next) => {
  if (!dbServiceInstance && !dbInitializationError) {
    if (!c.env.DB) {
      dbInitializationError = new Error(
        "DB binding is not available in Cloudflare environment.",
      );
      console.error(dbInitializationError.message);
    } else {
      try {
        dbServiceInstance = new DbPrismaD1Service(c.env.DB);
      } catch (error) {
        dbInitializationError = error as Error;
        console.error(
          "Failed to initialize DbService (Singleton):",
          dbInitializationError,
        );
      }
    }
  }

  if (dbInitializationError) {
    return c.text("Internal Server Error - DB Initialization Failed", {
      status: 500,
    });
  }

  if (!dbServiceInstance) {
    console.error(
      "Critical Error: dbServiceInstance is null after initialization check.",
    );
    return c.text("Internal Server Error - Unexpected DB State", {
      status: 500,
    });
  }

  c.set("dbService", dbServiceInstance);
  await next();
});

app.use("*", TimeoutMiddleware);

app.use("*", async (c, next) => {
  const authKey = c.env.API_AUTH_KEY;
  if (!authKey) {
    console.error("Error: API_AUTH_KEY environment variable is not set.");
    return c.text("Internal Server Error - Auth Key Missing", { status: 500 });
  }
  return AuthMiddleware(authKey)(c, next);
});

app.route("/keys", keysRouter);

app.all("/*", ProxyHandler);

export default app;
