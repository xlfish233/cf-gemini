import { Hono, Context } from "hono"; // Import Hono if needed for types
import { IDatabaseService } from '../db/interface'; // Import the interface
import type { D1Database } from '@cloudflare/workers-types'; // Import D1 type if needed elsewhere, or rely on Env

// Define types for Hono Context
type Env = {
  DB: D1Database; // D1 Binding expected in wrangler.toml
  TARGET_API_HOST?: string; // Optional: Target API host from env
  // Add other bindings/variables as needed
}
type Variables = {
  dbService: IDatabaseService; // dbService instance injected via middleware
}

// Use typed Context
export const ProxyHandler = async (c: Context<{ Bindings: Env, Variables: Variables }>) => {
    // Get dbService instance from context (set by middleware)
    const dbService = c.var.dbService;
    if (!dbService) {
        console.error("Database service not available in context");
        return c.text("Internal server configuration error", { status: 500 });
    }

    const url = new URL(c.req.url);
    const originalPath = url.pathname;
    // Target API address, read from environment or use default
    const targetApiHost = c.env.TARGET_API_HOST || "generativelanguage.googleapis.com";
    url.host = targetApiHost;
    // Remove prefix if your Hono route includes it, e.g., /proxy
    // url.pathname = url.pathname.replace(/^\/proxy/, ''); // Adjust if needed

    // Extract model name and method (e.g., from /v1beta/models/gemini-pro:generateContent)
    const pathSegments = originalPath.split('/');
    let model: string | undefined;
    let method: string | undefined;
    const modelsIndex = pathSegments.findIndex(segment => segment === 'models');
    if (modelsIndex !== -1 && pathSegments.length > modelsIndex + 1) {
        const modelAndMethod = pathSegments[modelsIndex + 1];
        [model, method] = modelAndMethod.split(':');
    }

    console.log(`Proxying request for model: ${model}, method: ${method}`);

    if (!model) {
        console.error("Could not extract model name from path:", originalPath);
        return c.text("Could not determine model from request path", {
            status: 400,
        });
    }

    let apiKey: string | null = null;
    try {
        apiKey = await dbService.getBestApiKey(model); // Use the instance from context
    } catch (error) {
        console.error(`Error getting API key for model ${model}:`, error);
        return c.text("Internal server error retrieving API key", {
            status: 500,
        });
    }

    if (!apiKey) {
        console.error(`No API key available for model: ${model}`);
        return c.text(`No API key available for model ${model}`, {
            status: 503, // Service Unavailable is appropriate
        });
    }

    console.log(`Using key: ${apiKey.substring(0, 4)}... for model: ${model}`);

    const newHeaders = new Headers(c.req.raw.headers);
    newHeaders.set("x-goog-api-key", apiKey); // Google uses x-goog-api-key
    newHeaders.delete("host"); // Remove original host
    newHeaders.delete("authorization"); // Remove original auth
    // Consider removing other headers like 'cf-connecting-ip', etc. if needed

    let response: Response;
    try {
        const targetUrl = url.toString();
        console.log(`Forwarding request to: ${targetUrl}`);
        response = await fetch(
            new Request(targetUrl, { // Use the modified targetUrl
                method: c.req.method,
                body: c.req.raw.body, // Stream body if possible for large requests
                headers: newHeaders,
                // Pass Cloudflare-specific options if needed
                // cf: c.req.raw.cf,
            }),
        );
    } catch (fetchError) {
        console.error(
            `Error fetching from target API (${targetApiHost}) for model ${model} with key ${
                apiKey.substring(0, 4)
            }...:`,
            fetchError,
        );
        // Record error count on fetch failure
        try {
            await dbService.addErrorCount(apiKey, model); // Pass model
        } catch (dbError) {
             console.error(`Error recording error count after fetch failure for key ${apiKey.substring(0,4)}...:`, dbError);
        }
        return c.text("Failed to communicate with the upstream API", {
            status: 502, // Bad Gateway
        });
    }

    try {
        // Record usage and potentially errors based on response status
        if (!response.ok) { // Check status codes 200-299
            console.warn(
                `Target API returned non-OK status ${response.status} for model ${model} using key ${
                    apiKey.substring(0, 4)
                }...`,
            );
            // Increment error count for specific error statuses (e.g., rate limits, invalid key, server errors)
            if (response.status === 429 || response.status === 400 || response.status >= 500) {
                 await dbService.addErrorCount(apiKey, model); // Pass model
            }
            // Always record usage attempt? Or only on success?
            // Current implementation records usage regardless via upsert.
            await dbService.addUsage(apiKey, model);
        } else {
            // Successful response from target API
            await dbService.addUsage(apiKey, model); // Record successful usage
        }
    } catch (dbError) {
        console.error(
            `Error recording usage/error for key ${
                apiKey.substring(0, 4)
            }..., model ${model}:`,
            dbError,
        );
    }

    // Return the response from the target API back to the client
    // Create a new response to make headers mutable
    const responseHeaders = new Headers(response.headers);
    // Allow Cloudflare to handle compression, etc.
    responseHeaders.delete('content-encoding');
    // Add/remove other headers as needed

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });
};
