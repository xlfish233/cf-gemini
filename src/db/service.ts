import {
    type ApiKeys,
    type ApiKeyUsage,
    PrismaClient,
} from "../generated/prisma"; // Generated Prisma Client + Types
import { PrismaD1 } from "@prisma/adapter-d1"; // D1 Adapter
import { IDatabaseService } from "./interface"; // Service Interface
import type { D1Database } from "@cloudflare/workers-types"; // D1 Binding type

/**
 * 使用 Prisma 和 Cloudflare D1 实现的数据库服务。
 */
export class DbPrismaD1Service implements IDatabaseService {
    private prisma: PrismaClient;

    constructor(d1: D1Database) { // 接收 D1 绑定
        if (!d1) {
            throw new Error(
                "D1Database binding is required for DbPrismaD1Service.",
            );
        }
        const adapter = new PrismaD1(d1);
        this.prisma = new PrismaClient({ adapter });
        console.log("DbPrismaD1Service initialized.");
    }

    /**
     * 检查数据库连接 (通过执行一个简单查询)。
     */
    async checkDbConnection(): Promise<boolean> {
        try {
            // 尝试查询第一个 ApiKey，如果成功则连接正常
            await this.prisma.apiKeys.findFirst();
            console.log(
                "Prisma D1 database connection successful (checked via query).",
            );
            return true;
        } catch (error) {
            console.error("Prisma D1 database connection failed:", error);
            return false;
        }
    }

    /**
     * 获取特定模型的最佳 API Key。
     * 基于 usage 和 error 计数排序。
     */
    async getBestApiKey(model: string): Promise<string | null> {
        console.log(
            `DbPrismaD1Service: Getting best API key for model ${model}. Prioritizing completely unused keys, then usage=0 keys.`,
        );
        try {
            // 1. 获取所有有效的 API Keys
            const allApiKeys = await this.prisma.apiKeys.findMany({
                select: { api_key: true },
            });

            if (allApiKeys.length === 0) {
                console.error("DbPrismaD1Service: No API keys found in ApiKeys table.");
                return null;
            }
            const allApiKeySet = new Set(allApiKeys.map((k) => k.api_key));

            // 2. 获取该模型的所有使用记录
            const usageRecords = await this.prisma.apiKeyUsage.findMany({
                where: { model: model },
                select: { api_key: true, usage: true, error: true }, // Select necessary fields
            });

            const usedApiKeySet = new Set(usageRecords.map((r) => r.api_key));

            // 3. 查找完全未使用的 Key (存在于 ApiKeys 但不在 ApiKeyUsage for this model)
            let completelyUnusedKey: string | null = null;
            for (const apiKey of allApiKeySet) {
                if (!usedApiKeySet.has(apiKey)) {
                    completelyUnusedKey = apiKey;
                    break; // 找到第一个就够了
                }
            }

            if (completelyUnusedKey) {
                console.log(
                    `DbPrismaD1Service: Found completely unused API key for model ${model}: ${
                        completelyUnusedKey.substring(0, 4)
                    }...`,
                );
                // 注意：返回此 key 后，下次调用 addUsage/addError 会创建 usage 记录
                return completelyUnusedKey;
            }

            // 4. 如果没有完全未使用的 Key，则在现有 usage 记录中查找 usage = 0 的 Key
            console.log(
                `DbPrismaD1Service: No completely unused key found for model ${model}. Checking for keys with usage=0.`,
            );
            const zeroUsageKeys = usageRecords
                .filter((r) => r.usage === 0)
                .sort((a, b) => a.error - b.error); // 按 error 升序

            if (zeroUsageKeys.length > 0) {
                const bestZeroUsageKey = zeroUsageKeys[0].api_key;
                console.log(
                    `DbPrismaD1Service: Found API key with usage=0 for model ${model}: ${
                        bestZeroUsageKey.substring(0, 4)
                    }... (Error count: ${zeroUsageKeys[0].error})`,
                );
                return bestZeroUsageKey;
            }

            // 5. 如果没有 usage = 0 的 Key，则按 usage asc, error asc 排序选择最佳 Key
            console.log(
                `DbPrismaD1Service: No key with usage=0 found for model ${model}. Getting best used key (usage ASC, error ASC).`,
            );
            // 对所有 usage 记录排序
            const sortedUsageRecords = usageRecords.sort((a, b) => {
                if (a.usage !== b.usage) {
                    return a.usage - b.usage; // usage 升序
                }
                return a.error - b.error; // error 升序
            });

            if (sortedUsageRecords.length > 0) {
                const bestUsedKey = sortedUsageRecords[0].api_key;
                 console.log(
                    `DbPrismaD1Service: Found best used API key for model ${model}: ${
                        bestUsedKey.substring(0, 4)
                    }... (Usage: ${sortedUsageRecords[0].usage}, Error: ${sortedUsageRecords[0].error})`,
                );
                return bestUsedKey;
            } else {
                 // 这个分支理论上不应该到达，因为如果 usageRecords 为空，
                 // 步骤 3 应该已经找到了 completelyUnusedKey (除非 allApiKeys 也为空，已在开头处理)
                 // 但为了健壮性，保留一个后备
                 console.warn(
                    `DbPrismaD1Service: No usage records found for model ${model}, and somehow no completely unused key was identified. Falling back to the first key in ApiKeys.`,
                 );
                 // 直接从 allApiKeys 返回第一个 (已在步骤 1 获取)
                 return allApiKeys[0].api_key;
            }

        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error getting best API key for model ${model}:`,
                error,
            );
            return null;
        }
    }

    /**
     * 增加 API Key 对特定模型的错误计数。
     * 使用 upsert 确保记录存在。
     */
    async addErrorCount(apiKey: string, model: string): Promise<void> {
        console.log(
            `DbPrismaD1Service: Adding error count for apiKey: ${apiKey}, model: ${model}`,
        );
        try {
            await this.prisma.apiKeyUsage.upsert({
                where: { api_key_model: { api_key: apiKey, model: model } }, // Composite key
                create: {
                    api_key: apiKey,
                    model: model,
                    usage: 0,
                    error: 1, // Start with 1 error
                    weight: 1,
                },
                update: {
                    error: { increment: 1 }, // Increment error count
                },
            });
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error adding error count for apiKey ${apiKey}, model ${model}:`,
                error,
            );
            // Prisma 通常会抛出详细错误，例如 P2003 代表外键约束失败
            // Type guard for Prisma errors
            if (
                typeof error === "object" && error !== null &&
                "code" in error && typeof error.code === "string"
            ) {
                if (error.code === "P2003") {
                    console.error(
                        `DbPrismaD1Service: Foreign key constraint failed. Ensure apiKey ${apiKey} exists in ApiKeys table before adding usage/error.`,
                    );
                }
            }
            // throw error; // Re-throw if needed
        }
    }

    /**
     * 增加 API Key 对特定模型的使用计数。
     * 使用 upsert 确保记录存在。
     */
    async addUsage(apiKey: string, model: string): Promise<void> {
        console.log(
            `DbPrismaD1Service: Adding usage for apiKey: ${apiKey}, model: ${model}`,
        );
        try {
            await this.prisma.apiKeyUsage.upsert({
                where: { api_key_model: { api_key: apiKey, model: model } }, // Composite key
                create: {
                    api_key: apiKey,
                    model: model,
                    usage: 1, // Start with 1 usage
                    error: 0,
                    weight: 1,
                },
                update: {
                    usage: { increment: 1 }, // Increment usage count
                },
            });
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error adding usage for apiKey ${apiKey}, model ${model}:`,
                error,
            );
            // Type guard for Prisma errors
            if (
                typeof error === "object" && error !== null &&
                "code" in error && typeof error.code === "string"
            ) {
                if (error.code === "P2003") {
                    console.error(
                        `DbPrismaD1Service: Foreign key constraint failed. Ensure apiKey ${apiKey} exists in ApiKeys table before adding usage/error.`,
                    );
                }
            }
            // throw error;
        }
    }

    // --- ApiKey CRUD ---

    /**
     * 创建一个新的 API Key。
     * 如果 Key 已存在，会抛出 Prisma 错误 (P2002 - Unique constraint failed)。
     */
    async createApiKey(apiKey: string): Promise<ApiKeys> {
        console.log(
            `DbPrismaD1Service: Creating new API key: ${
                apiKey.substring(0, 4)
            }...`,
        );
        try {
            const newKey = await this.prisma.apiKeys.create({
                data: {
                    api_key: apiKey,
                },
            });
            console.log(
                `DbPrismaD1Service: Successfully created API key: ${
                    newKey.api_key.substring(0, 4)
                }...`,
            );
            return newKey;
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error creating API key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            // Re-throw the error to be handled by the caller (e.g., return specific HTTP status)
            throw error;
        }
    }

    /**
     * 获取指定的 API Key。
     */
    async getApiKey(apiKey: string): Promise<ApiKeys | null> {
        console.log(
            `DbPrismaD1Service: Getting API key: ${apiKey.substring(0, 4)}...`,
        );
        try {
            const key = await this.prisma.apiKeys.findUnique({
                where: { api_key: apiKey },
            });
            if (key) {
                console.log(
                    `DbPrismaD1Service: Found API key: ${
                        key.api_key.substring(0, 4)
                    }...`,
                );
            } else {
                console.log(
                    `DbPrismaD1Service: API key not found: ${
                        apiKey.substring(0, 4)
                    }...`,
                );
            }
            return key;
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error getting API key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            throw error; // Re-throw
        }
    }

    /**
     * 获取所有的 API Keys。
     */
    async getAllApiKeys(): Promise<ApiKeys[]> {
        console.log(`DbPrismaD1Service: Getting all API keys.`);
        try {
            const keys = await this.prisma.apiKeys.findMany();
            console.log(`DbPrismaD1Service: Found ${keys.length} API keys.`);
            return keys;
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error getting all API keys:`,
                error,
            );
            throw error; // Re-throw
        }
    }

    /**
     * 删除指定的 API Key。
     * 如果 Key 不存在，会抛出 Prisma 错误 (P2025 - Record to delete does not exist)。
     * 由于设置了级联删除 (onDelete: Cascade)，相关的 ApiKeyUsage 记录也会被删除。
     */
    async deleteApiKey(apiKey: string): Promise<ApiKeys> {
        console.log(
            `DbPrismaD1Service: Deleting API key: ${apiKey.substring(0, 4)}...`,
        );
        try {
            const deletedKey = await this.prisma.apiKeys.delete({
                where: { api_key: apiKey },
            });
            console.log(
                `DbPrismaD1Service: Successfully deleted API key: ${
                    deletedKey.api_key.substring(0, 4)
                }...`,
            );
            return deletedKey;
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error deleting API key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            throw error; // Re-throw
        }
    }

    // --- ApiKeyUsage Queries ---

    /**
     * 获取指定 API Key 的使用情况。
     * 可选地按模型过滤。
     */
    async getApiKeyUsage(
        apiKey: string,
        model?: string,
    ): Promise<ApiKeyUsage[]> {
        const logModel = model ? ` for model ${model}` : "";
        console.log(
            `DbPrismaD1Service: Getting usage for API key: ${
                apiKey.substring(0, 4)
            }...${logModel}`,
        );
        try {
            const usage = await this.prisma.apiKeyUsage.findMany({
                where: {
                    api_key: apiKey,
                    ...(model && { model: model }), // Add model filter if provided
                },
                orderBy: { // Optional: order by model for consistency
                    model: "asc",
                },
            });
            console.log(
                `DbPrismaD1Service: Found ${usage.length} usage records for API key ${
                    apiKey.substring(0, 4)
                }...${logModel}`,
            );
            return usage;
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error getting usage for API key ${
                    apiKey.substring(0, 4)
                }...${logModel}:`,
                error,
            );
            throw error; // Re-throw
        }
    }

    /**
     * 获取所有的 ApiKeyUsage 记录。
     */
    async getAllApiKeyUsage(): Promise<ApiKeyUsage[]> {
        console.log(`DbPrismaD1Service: Getting all API key usage records.`);
        try {
            const allUsage = await this.prisma.apiKeyUsage.findMany({
                orderBy: [ // Optional: order for consistency
                    { api_key: "asc" },
                    { model: "asc" },
                ],
            });
            console.log(
                `DbPrismaD1Service: Found ${allUsage.length} total usage records.`,
            );
            return allUsage;
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error getting all API key usage records:`,
                error,
            );
            throw error; // Re-throw
        }
    }

    // --- Deprecated/Internal Methods ---

    /**
     * @deprecated Use createApiKey instead for explicit creation.
     * This method remains for potential internal use or backward compatibility if needed,
     * but the primary way to add keys should be via createApiKey.
     * Adds a new API Key to the ApiKeys table using upsert (won't throw if exists).
     */
    async addKey(apiKey: string): Promise<void> {
        console.warn(
            `DbPrismaD1Service: addKey is deprecated. Use createApiKey for adding new keys.`,
        );
        console.log(
            `DbPrismaD1Service: Upserting key: ${
                apiKey.substring(0, 4)
            }... to ApiKeys`,
        );
        try {
            await this.prisma.apiKeys.upsert({
                where: { api_key: apiKey },
                create: { api_key: apiKey },
                update: {}, // Do nothing if it already exists
            });
            console.log(
                `DbPrismaD1Service: Key ${
                    apiKey.substring(0, 4)
                }... upserted or already exists in ApiKeys.`,
            );
        } catch (error) {
            console.error(
                `DbPrismaD1Service: Error upserting key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            // throw error; // Decide if this internal method should throw
        }
    }
}

// 注意：实例化将在 Hono 中间件或路由处理程序中进行，如下所示：
//
// import { Hono } from 'hono';
// import { DbPrismaD1Service } from './db/service'; // Adjust path
// import { IDatabaseService } from './db/interface'; // Adjust path
//
// type Env = {
//   DB: D1Database; // D1 binding
// }
// type Variables = {
//   dbService: IDatabaseService;
// }
//
// const app = new Hono<{ Bindings: Env, Variables: Variables }>();
//
// // Middleware to create and attach dbService instance
// app.use('*', async (c, next) => {
//   if (!c.var.dbService) { // Create instance only once per request if needed
//      const dbService = new DbPrismaD1Service(c.env.DB);
//      c.set('dbService', dbService);
//   }
//   await next();
// });
//
// // Example usage in a route
// app.get('/some-route', async (c) => {
//   const dbService = c.var.dbService; // Get instance from context
//   const key = await dbService.getBestApiKey('some-model');
//   // ...
// });
