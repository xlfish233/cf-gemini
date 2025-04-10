import type { ApiKeys, ApiKeyUsage } from '../generated/prisma';

export interface IDatabaseService {
    checkDbConnection(): Promise<boolean>;
    getBestApiKey(model: string): Promise<string | null>;
    addErrorCount(apiKey: string, model: string): Promise<void>;
    addUsage(apiKey: string, model: string): Promise<void>;
    createApiKey(apiKey: string): Promise<ApiKeys>;
    getApiKey(apiKey: string): Promise<ApiKeys | null>;
    getAllApiKeys(): Promise<ApiKeys[]>;
    deleteApiKey(apiKey: string): Promise<ApiKeys>;
    getApiKeyUsage(apiKey: string, model?: string): Promise<ApiKeyUsage[]>;
    getAllApiKeyUsage(): Promise<ApiKeyUsage[]>;
}