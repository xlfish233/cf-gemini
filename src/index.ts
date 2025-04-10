import { Hono } from "hono";
// import { serve } from "@hono/node-server"; // Remove node-server import
import { config } from "dotenv";
import { TimeoutMiddleware } from "./middlewares/timeout";
import { AuthMiddleware } from "./middlewares/auth";
import { DbPrismaService } from "./db/service";
import { IDatabaseService } from "./db/interface";
import { PrismaClient } from "./generated/prisma";
import { ProxyHandler } from "./router/proxy";
import keysRouter from "./router/keys";

config();

type Bindings = {
  API_AUTH_KEY: string;
  TARGET_API_HOST?: string;
};
type Variables = {
  dbService: IDatabaseService;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

let dbServiceInstance: IDatabaseService | null = null;
let dbInitializationError: Error | null = null;
let prismaClientInstance: PrismaClient | null = null;

try {
    prismaClientInstance = new PrismaClient();
    dbServiceInstance = new DbPrismaService(prismaClientInstance);
    console.log("Local Prisma Client and DbService initialized successfully.");
    dbServiceInstance.checkDbConnection().then(connected => {
        if (!connected) console.error("Initial database connection check failed.");
    });
} catch (error) {
    dbInitializationError = error as Error;
    console.error("Failed to initialize local Prisma Client or DbService:", dbInitializationError);
}

app.use("*", async (c, next) => {
  if (dbInitializationError) {
    console.error("DB Initialization Error:", dbInitializationError);
    return c.text("Internal Server Error - DB Initialization Failed", { status: 500 });
  }
  if (!dbServiceInstance) {
    console.error("Critical Error: dbServiceInstance is null after initialization attempt.");
    return c.text("Internal Server Error - Unexpected DB State", { status: 500 });
  }
  c.set("dbService", dbServiceInstance);
  await next();
});

app.use("*", TimeoutMiddleware);

app.use("*", async (c, next) => {
  const authKey = process.env.API_AUTH_KEY;
  if (!authKey) {
    console.error("Error: API_AUTH_KEY environment variable is not set.");
    return c.text("Internal Server Error - Auth Key Missing", { status: 500 });
  }
  return AuthMiddleware(authKey)(c, next);
});

app.route("/keys", keysRouter);
app.all("/*", ProxyHandler);

// --- Bun Server Export ---
const port = parseInt(process.env.PORT || "3000", 10);
console.log(`Server configured to run on port ${port}`);

export default {
  port: port,
  fetch: app.fetch,
};

// Graceful shutdown remains important
const cleanup = async () => {
  console.log("Disconnecting Prisma Client...");
  if (prismaClientInstance) {
    await prismaClientInstance.$disconnect();
    console.log("Prisma Client disconnected.");
  }
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
