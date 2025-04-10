import { Hono, Context } from "hono";
import { IDatabaseService } from '../db/interface';
import type { D1Database } from '@cloudflare/workers-types';

type Env = {
  DB: D1Database;
  TARGET_API_HOST?: string;

}
type Variables = {
  dbService: IDatabaseService;
}

export const ProxyHandler = async (c: Context<{ Bindings: Env, Variables: Variables }>) => {
    const dbService = c.var.dbService;
    if (!dbService) {
        console.error("Database service not available in context");
        return c.text("Internal server configuration error", { status: 500 });
    }

    const url = new URL(c.req.url);
    const originalPath = url.pathname;
    const targetApiHost = c.env.TARGET_API_HOST || "generativelanguage.googleapis.com";
    url.host = targetApiHost;


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
        apiKey = await dbService.getBestApiKey(model);
    } catch (error) {
        console.error(`Error getting API key for model ${model}:`, error);
        return c.text("Internal server error retrieving API key", {
            status: 500,
        });
    }

    if (!apiKey) {
        console.error(`No API key available for model: ${model}`);
        return c.text(`No API key available for model ${model}`, {
            status: 503,
        });
    }

    console.log(`Using key: ${apiKey.substring(0, 4)}... for model: ${model}`);

    const newHeaders = new Headers(c.req.raw.headers);
    newHeaders.set("x-goog-api-key", apiKey);
    newHeaders.delete("host");
    newHeaders.delete("authorization");


    let response: Response;
    try {
        const targetUrl = url.toString();
        console.log(`Forwarding request to: ${targetUrl}`);
        response = await fetch(
            new Request(targetUrl, {
                method: c.req.method,
                body: c.req.raw.body,
                headers: newHeaders,

            }),
        );
    } catch (fetchError) {
        console.error(
            `Error fetching from target API (${targetApiHost}) for model ${model} with key ${
                apiKey.substring(0, 4)
            }...:`, fetchError);

        c.executionCtx.waitUntil((async () => {
            try {
                await dbService.addErrorCount(apiKey, model);
            } catch (dbError) {
                console.error(`waitUntil: Error recording error count after fetch failure for key ${apiKey.substring(0,4)}...:`, dbError);
            }
        })());

        return c.text("Failed to communicate with the upstream API", {
            status: 502,
        });
    }

    c.executionCtx.waitUntil((async () => {
        try {
            if (!response.ok) {
                console.warn(
                    `waitUntil: Target API returned non-OK status ${response.status} for model ${model} using key ${
                        apiKey.substring(0, 4)
                    }...`,
                );
                if (response.status === 429 || response.status === 400 || response.status >= 500) {
                    await dbService.addErrorCount(apiKey, model);
                }
                await dbService.addUsage(apiKey, model);
            } else {
                await dbService.addUsage(apiKey, model);
            }
        } catch (dbError) {
            console.error(
                `waitUntil: Error recording usage/error for key ${
                    apiKey.substring(0, 4)
                }..., model ${model}:`, dbError);
        }
    })());

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');


    // 读取完整的响应体
    const body = await response.arrayBuffer();

    // 使用读取到的完整响应体创建新的 Response 对象
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });
};
