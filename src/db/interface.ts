import type { ApiKeys, ApiKeyUsage } from '../generated/prisma'; // Import Prisma types

export interface IDatabaseService {
    checkDbConnection(): Promise<boolean>;
    getBestApiKey(model: string): Promise<string | null>;
    addErrorCount(apiKey: string, model: string): Promise<void>; // Added model
    addUsage(apiKey: string, model: string): Promise<void>;
    // ApiKey CRUD
    createApiKey(apiKey: string): Promise<ApiKeys>;
    getApiKey(apiKey: string): Promise<ApiKeys | null>;
    getAllApiKeys(): Promise<ApiKeys[]>;
    deleteApiKey(apiKey: string): Promise<ApiKeys>; // Returns the deleted key

    // ApiKeyUsage Queries
    getApiKeyUsage(apiKey: string, model?: string): Promise<ApiKeyUsage[]>; // Get usage for a specific key, optionally filtered by model
    getAllApiKeyUsage(): Promise<ApiKeyUsage[]>; // Get all usage records
}