import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { IDatabaseService } from '../db/interface'; // Import DB interface
import type { ApiKeys, ApiKeyUsage } from '../generated/prisma'; // Import Prisma types
import { Prisma } from '../generated/prisma'; // Import Prisma for error handling

// Define types for Hono Context specific to this router, inheriting from the main app's types if needed
// Assuming the main app defines Bindings and Variables including dbService
type Bindings = {
    // Inherit or define bindings needed specifically here if any
    // Example: Maybe a specific API key for managing keys?
};
type Variables = {
    dbService: IDatabaseService; // Expect dbService to be injected by middleware
};

const keysRouter = new Hono<{ Bindings: Bindings, Variables: Variables }>();

// --- API Key CRUD Routes ---

// POST /keys - Create a new API Key
keysRouter.post('/', async (c) => {
    const dbService = c.var.dbService;
    try {
        const body = await c.req.json<{ api_key: string }>();
        if (!body || typeof body.api_key !== 'string' || body.api_key.trim() === '') {
            throw new HTTPException(400, { message: 'Invalid request body. "api_key" (string) is required.' });
        }
        const apiKey = body.api_key.trim();

        // Basic validation (e.g., length, format) - adjust as needed
        if (apiKey.length < 10) { // Example minimum length
             throw new HTTPException(400, { message: 'API key must be at least 10 characters long.' });
        }

        const newKey = await dbService.createApiKey(apiKey);
        return c.json(newKey, 201); // 201 Created
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Unique constraint violation (key already exists)
            throw new HTTPException(409, { message: 'API key already exists.' });
        }
        if (error instanceof HTTPException) {
            throw error; // Re-throw Hono's HTTPException
        }
        console.error("Error creating API key:", error);
        throw new HTTPException(500, { message: 'Internal Server Error creating API key' });
    }
});

// GET /keys - Get all API Keys
keysRouter.get('/', async (c) => {
    const dbService = c.var.dbService;
    try {
        const keys = await dbService.getAllApiKeys();
        // Consider security: Should we really expose all keys? Maybe just count or partial keys?
        // For now, returning all as requested.
        return c.json(keys);
    } catch (error) {
        console.error("Error getting all API keys:", error);
        throw new HTTPException(500, { message: 'Internal Server Error getting API keys' });
    }
});

// GET /keys/:apiKey - Get a specific API Key
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
            throw error; // Re-throw Hono's HTTPException
        }
        console.error(`Error getting API key ${apiKey}:`, error);
        throw new HTTPException(500, { message: 'Internal Server Error getting API key' });
    }
});

// DELETE /keys/:apiKey - Delete a specific API Key
keysRouter.delete('/:apiKey', async (c) => {
    const dbService = c.var.dbService;
    const apiKey = c.req.param('apiKey');
     if (!apiKey) {
         throw new HTTPException(400, { message: 'API key parameter is required.' });
    }
    try {
        const deletedKey = await dbService.deleteApiKey(apiKey);
        // No content to return, successful deletion indicated by 204 status
        return c.json(deletedKey); // Or return c.body(null, 204) if no body is preferred
    } catch (error: unknown) {
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            // Record to delete not found
            throw new HTTPException(404, { message: 'API key not found.' });
        }
        if (error instanceof HTTPException) {
            throw error; // Re-throw Hono's HTTPException
        }
        console.error(`Error deleting API key ${apiKey}:`, error);
        throw new HTTPException(500, { message: 'Internal Server Error deleting API key' });
    }
});

// --- API Key Usage Query Routes ---

// GET /keys/:apiKey/usage - Get usage for a specific API Key (optional model filter)
keysRouter.get('/:apiKey/usage', async (c) => {
    const dbService = c.var.dbService;
    const apiKey = c.req.param('apiKey');
    const model = c.req.query('model'); // Get optional 'model' query parameter

    if (!apiKey) {
         throw new HTTPException(400, { message: 'API key parameter is required.' });
    }

    try {
        // First, check if the API key actually exists to give a proper 404
        const keyExists = await dbService.getApiKey(apiKey);
        if (!keyExists) {
             throw new HTTPException(404, { message: 'API key not found.' });
        }

        const usage = await dbService.getApiKeyUsage(apiKey, model); // Pass model if provided
        return c.json(usage);
    } catch (error) {
         if (error instanceof HTTPException) {
            throw error; // Re-throw Hono's HTTPException
        }
        console.error(`Error getting usage for API key ${apiKey}${model ? ` (model: ${model})` : ''}:`, error);
        throw new HTTPException(500, { message: 'Internal Server Error getting API key usage' });
    }
});

// GET /keys/usage - Get all usage records (Potentially large response, use with caution)
// Consider adding pagination or filtering if this becomes necessary
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