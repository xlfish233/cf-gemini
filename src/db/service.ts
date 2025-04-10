import {
    type ApiKeys,
    type ApiKeyUsage,
    PrismaClient, // Use standard PrismaClient
} from "../generated/prisma";
// import { PrismaD1 } from "@prisma/adapter-d1"; // Remove D1 adapter
import { IDatabaseService } from "./interface";
// import type { D1Database } from "@cloudflare/workers-types"; // Remove D1 type

// Rename class to reflect it's now a general Prisma service
export class DbPrismaService implements IDatabaseService {
    private prisma: PrismaClient;

    // Constructor now accepts a PrismaClient instance
    constructor(prismaInstance: PrismaClient) {
        if (!prismaInstance) {
            throw new Error(
                "PrismaClient instance is required for DbPrismaService.",
            );
        }
        this.prisma = prismaInstance;
        console.log("DbPrismaService initialized.");
    }

    async checkDbConnection(): Promise<boolean> {
        try {
            // Use a simple query to check connection
            await this.prisma.$queryRaw`SELECT 1`;
            console.log(
                "Prisma database connection successful (checked via query).",
            );
            return true;
        } catch (error) {
            console.error("Prisma database connection failed:", error);
            return false;
        }
    }

    async getBestApiKey(model: string): Promise<string | null> {
        console.log(
            `DbPrismaService: Getting best API key for model ${model}. Prioritizing completely unused keys, then usage=0 keys.`,
        );
        try {
            const allApiKeys = await this.prisma.apiKeys.findMany({
                select: { api_key: true },
            });

            if (allApiKeys.length === 0) {
                console.error("DbPrismaService: No API keys found in ApiKeys table.");
                return null;
            }
            const allApiKeySet = new Set(allApiKeys.map((k) => k.api_key));

            const usageRecords = await this.prisma.apiKeyUsage.findMany({
                where: { model: model },
                select: { api_key: true, usage: true, error: true },
            });

            const usedApiKeySet = new Set(usageRecords.map((r) => r.api_key));

            let completelyUnusedKey: string | null = null;
            for (const apiKey of allApiKeySet) {
                if (!usedApiKeySet.has(apiKey)) {
                    completelyUnusedKey = apiKey;
                    break;
                }
            }

            if (completelyUnusedKey) {
                console.log(
                    `DbPrismaService: Found completely unused API key for model ${model}: ${
                        completelyUnusedKey.substring(0, 4)
                    }...`,
                );
                return completelyUnusedKey;
            }

            console.log(
                `DbPrismaService: No completely unused key found for model ${model}. Checking for keys with usage=0.`,
            );
            const zeroUsageKeys = usageRecords
                .filter((r) => r.usage === 0)
                .sort((a, b) => a.error - b.error);

            if (zeroUsageKeys.length > 0) {
                const bestZeroUsageKey = zeroUsageKeys[0].api_key;
                console.log(
                    `DbPrismaService: Found API key with usage=0 for model ${model}: ${
                        bestZeroUsageKey.substring(0, 4)
                    }... (Error count: ${zeroUsageKeys[0].error})`,
                );
                return bestZeroUsageKey;
            }

            console.log(
                `DbPrismaService: No key with usage=0 found for model ${model}. Getting best used key (usage ASC, error ASC).`,
            );
            const sortedUsageRecords = usageRecords.sort((a, b) => {
                if (a.usage !== b.usage) {
                    return a.usage - b.usage;
                }
                return a.error - b.error;
            });

            if (sortedUsageRecords.length > 0) {
                const bestUsedKey = sortedUsageRecords[0].api_key;
                 console.log(
                    `DbPrismaService: Found best used API key for model ${model}: ${
                        bestUsedKey.substring(0, 4)
                    }... (Usage: ${sortedUsageRecords[0].usage}, Error: ${sortedUsageRecords[0].error})`,
                );
                return bestUsedKey;
            } else {
                 console.warn(
                    `DbPrismaService: No usage records found for model ${model}, and somehow no completely unused key was identified. Falling back to the first key in ApiKeys.`,
                 );
                 // Ensure allApiKeys is not empty before accessing index 0
                 return allApiKeys.length > 0 ? allApiKeys[0].api_key : null;
            }

        } catch (error) {
            console.error(
                `DbPrismaService: Error getting best API key for model ${model}:`,
                error,
            );
            return null;
        }
    }

    async addErrorCount(apiKey: string, model: string): Promise<void> {
        console.log(
            `DbPrismaService: Adding error count for apiKey: ${apiKey}, model: ${model}`,
        );
        try {
            await this.prisma.apiKeyUsage.upsert({
                where: { api_key_model: { api_key: apiKey, model: model } },
                create: {
                    api_key: apiKey,
                    model: model,
                    usage: 0,
                    error: 1,
                    weight: 1,
                },
                update: {
                    error: { increment: 1 },
                },
            });
        } catch (error) {
            console.error(
                `DbPrismaService: Error adding error count for apiKey ${apiKey}, model ${model}:`,
                error,
            );
            if (
                typeof error === "object" && error !== null &&
                "code" in error && typeof error.code === "string"
            ) {
                if (error.code === "P2003") { // Prisma foreign key constraint error code
                    console.error(
                        `DbPrismaService: Foreign key constraint failed. Ensure apiKey ${apiKey} exists in ApiKeys table before adding usage/error.`,
                    );
                }
            }
        }
    }

    async addUsage(apiKey: string, model: string): Promise<void> {
        console.log(
            `DbPrismaService: Adding usage for apiKey: ${apiKey}, model: ${model}`,
        );
        try {
            await this.prisma.apiKeyUsage.upsert({
                where: { api_key_model: { api_key: apiKey, model: model } },
                create: {
                    api_key: apiKey,
                    model: model,
                    usage: 1,
                    error: 0,
                    weight: 1,
                },
                update: {
                    usage: { increment: 1 },
                },
            });
        } catch (error) {
            console.error(
                `DbPrismaService: Error adding usage for apiKey ${apiKey}, model ${model}:`,
                error,
            );
             if (
                typeof error === "object" && error !== null &&
                "code" in error && typeof error.code === "string"
            ) {
                if (error.code === "P2003") { // Prisma foreign key constraint error code
                    console.error(
                        `DbPrismaService: Foreign key constraint failed. Ensure apiKey ${apiKey} exists in ApiKeys table before adding usage/error.`,
                    );
                }
            }
        }
    }

    async createApiKey(apiKey: string): Promise<ApiKeys> {
        console.log(
            `DbPrismaService: Creating new API key: ${
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
                `DbPrismaService: Successfully created API key: ${
                    newKey.api_key.substring(0, 4)
                }...`,
            );
            return newKey;
        } catch (error) {
            console.error(
                `DbPrismaService: Error creating API key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            throw error;
        }
    }

    async getApiKey(apiKey: string): Promise<ApiKeys | null> {
        console.log(
            `DbPrismaService: Getting API key: ${apiKey.substring(0, 4)}...`,
        );
        try {
            const key = await this.prisma.apiKeys.findUnique({
                where: { api_key: apiKey },
            });
            if (key) {
                console.log(
                    `DbPrismaService: Found API key: ${
                        key.api_key.substring(0, 4)
                    }...`,
                );
            } else {
                console.log(
                    `DbPrismaService: API key not found: ${
                        apiKey.substring(0, 4)
                    }...`,
                );
            }
            return key;
        } catch (error) {
            console.error(
                `DbPrismaService: Error getting API key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            throw error;
        }
    }

    async getAllApiKeys(): Promise<ApiKeys[]> {
        console.log(`DbPrismaService: Getting all API keys.`);
        try {
            const keys = await this.prisma.apiKeys.findMany();
            console.log(`DbPrismaService: Found ${keys.length} API keys.`);
            return keys;
        } catch (error) {
            console.error(
                `DbPrismaService: Error getting all API keys:`,
                error,
            );
            throw error;
        }
    }

    async deleteApiKey(apiKey: string): Promise<ApiKeys> {
        console.log(
            `DbPrismaService: Deleting API key: ${apiKey.substring(0, 4)}...`,
        );
        try {
            // Need to delete related usage records first due to foreign key constraint
            await this.prisma.apiKeyUsage.deleteMany({
                where: { api_key: apiKey },
            });
            console.log(
                `DbPrismaService: Deleted usage records for API key: ${
                    apiKey.substring(0, 4)
                }...`,
            );
            const deletedKey = await this.prisma.apiKeys.delete({
                where: { api_key: apiKey },
            });
            console.log(
                `DbPrismaService: Successfully deleted API key: ${
                    deletedKey.api_key.substring(0, 4)
                }...`,
            );
            return deletedKey;
        } catch (error) {
            console.error(
                `DbPrismaService: Error deleting API key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
            throw error;
        }
    }

    async getApiKeyUsage(
        apiKey: string,
        model?: string,
    ): Promise<ApiKeyUsage[]> {
        const logModel = model ? ` for model ${model}` : "";
        console.log(
            `DbPrismaService: Getting usage for API key: ${
                apiKey.substring(0, 4)
            }...${logModel}`,
        );
        try {
            const usage = await this.prisma.apiKeyUsage.findMany({
                where: {
                    api_key: apiKey,
                    ...(model && { model: model }),
                },
                orderBy: {
                    model: "asc",
                },
            });
            console.log(
                `DbPrismaService: Found ${usage.length} usage records for API key ${
                    apiKey.substring(0, 4)
                }...${logModel}`,
            );
            return usage;
        } catch (error) {
            console.error(
                `DbPrismaService: Error getting usage for API key ${
                    apiKey.substring(0, 4)
                }...${logModel}:`,
                error,
            );
            throw error;
        }
    }

    async getAllApiKeyUsage(): Promise<ApiKeyUsage[]> {
        console.log(`DbPrismaService: Getting all API key usage records.`);
        try {
            const allUsage = await this.prisma.apiKeyUsage.findMany({
                orderBy: [
                    { api_key: "asc" },
                    { model: "asc" },
                ],
            });
            console.log(
                `DbPrismaService: Found ${allUsage.length} total usage records.`,
            );
            return allUsage;
        } catch (error) {
            console.error(
                `DbPrismaService: Error getting all API key usage records:`,
                error,
            );
            throw error;
        }
    }

    // This method seems redundant with createApiKey, keeping for compatibility if needed
    // but marking as potentially deprecated.
    async addKey(apiKey: string): Promise<void> {
        console.warn(
            `DbPrismaService: addKey is potentially deprecated. Use createApiKey for adding new keys.`,
        );
        console.log(
            `DbPrismaService: Upserting key: ${
                apiKey.substring(0, 4)
            }... to ApiKeys`,
        );
        try {
            await this.prisma.apiKeys.upsert({
                where: { api_key: apiKey },
                create: { api_key: apiKey },
                update: {}, // No update needed if it exists
            });
            console.log(
                `DbPrismaService: Key ${
                    apiKey.substring(0, 4)
                }... upserted or already exists in ApiKeys.`,
            );
        } catch (error) {
            console.error(
                `DbPrismaService: Error upserting key ${
                    apiKey.substring(0, 4)
                }...:`,
                error,
            );
        }
    }
}
