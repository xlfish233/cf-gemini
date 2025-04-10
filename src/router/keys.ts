import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { IDatabaseService } from '../db/interface';
import type { ApiKeys, ApiKeyUsage } from '../generated/prisma';
import { Prisma } from '../generated/prisma';

type Bindings = {

};
type Variables = {
    dbService: IDatabaseService;
};

const keysRouter = new Hono<{ Bindings: Bindings, Variables: Variables }>();


keysRouter.post('/', async (c) => {
    const dbService = c.var.dbService;
    try {
        const body = await c.req.json<{ api_key: string }>();
        if (!body || typeof body.api_key !== 'string' || body.api_key.trim() === '') {
            throw new HTTPException(400, { message: 'Invalid request body. "api_key" (string) is required.' });
        }
        const apiKey = body.api_key.trim();

        if (apiKey.length < 10) {
             throw new HTTPException(400, { message: 'API key must be at least 10 characters long.' });
        }

        const newKey = await dbService.createApiKey(apiKey);
        return c.json(newKey, 201);
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new HTTPException(409, { message: 'API key already exists.' });
        }
        if (error instanceof HTTPException) {
            throw error;
        }
        console.error("Error creating API key:", error);
        throw new HTTPException(500, { message: 'Internal Server Error creating API key' });
    }
});

keysRouter.get('/', async (c) => {
    const dbService = c.var.dbService;
    try {
        const keys = await dbService.getAllApiKeys();


        return c.json(keys);
    } catch (error) {
        console.error("Error getting all API keys:", error);
        throw new HTTPException(500, { message: 'Internal Server Error getting API keys' });
    }
});

keysRouter.get('/:apiKey', async (c) => {
    const dbService = c.var.dbService;
    const apiKey = c.req.param('apiKey');
    if (!apiKey) {
         throw new HTTPException(400, { message: 'API key parameter is required.' });
    }
    try {
        const key = await dbService.getApiKey(apiKey);
        if (!key) {
            throw new HTTPException(404, { message: 'API key not found.' });
        }
        return c.json(key);
    } catch (error) {
         if (error instanceof HTTPException) {
            throw error;
        }
        console.error(`Error getting API key ${apiKey}:`, error);
        throw new HTTPException(500, { message: 'Internal Server Error getting API key' });
    }
});

keysRouter.delete('/:apiKey', async (c) => {
    const dbService = c.var.dbService;
    const apiKey = c.req.param('apiKey');
     if (!apiKey) {
         throw new HTTPException(400, { message: 'API key parameter is required.' });
    }
    try {
        const deletedKey = await dbService.deleteApiKey(apiKey);
        return c.json(deletedKey);
    } catch (error: unknown) {
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new HTTPException(404, { message: 'API key not found.' });
        }
        if (error instanceof HTTPException) {
            throw error;
        }
        console.error(`Error deleting API key ${apiKey}:`, error);
        throw new HTTPException(500, { message: 'Internal Server Error deleting API key' });
    }
});


keysRouter.get('/:apiKey/usage', async (c) => {
    const dbService = c.var.dbService;
    const apiKey = c.req.param('apiKey');
    const model = c.req.query('model');

    if (!apiKey) {
         throw new HTTPException(400, { message: 'API key parameter is required.' });
    }

    try {
        const keyExists = await dbService.getApiKey(apiKey);
        if (!keyExists) {
             throw new HTTPException(404, { message: 'API key not found.' });
        }

        const usage = await dbService.getApiKeyUsage(apiKey, model);
        return c.json(usage);
    } catch (error) {
         if (error instanceof HTTPException) {
            throw error;
        }
        console.error(`Error getting usage for API key ${apiKey}${model ? ` (model: ${model})` : ''}:`, error);
        throw new HTTPException(500, { message: 'Internal Server Error getting API key usage' });
    }
});


keysRouter.get('/usage', async (c) => {
    const dbService = c.var.dbService;
    try {
        const allUsage = await dbService.getAllApiKeyUsage();
        return c.json(allUsage);
    } catch (error) {
        console.error("Error getting all API key usage:", error);
        throw new HTTPException(500, { message: 'Internal Server Error getting all API key usage' });
    }
});


export default keysRouter;