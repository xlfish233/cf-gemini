import { Context, Next } from "hono";

export const AuthMiddleware =
    (authKey: string) => async (c: Context, next: Next) => {
        console.log("x-goog-api-key:", c.req.header("x-goog-api-key"));
        console.log("authKey:", authKey);
        if (c.req.header("x-goog-api-key") !== authKey) {
            return c.text("Unauthorized", { status: 401 });
        }
        await next();
    };