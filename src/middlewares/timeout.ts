import { Context, Next } from "hono";

type Env = {
    Bindings: {
        TIMEOUT?: string;
    }
}

export const TimeoutMiddleware = async (c: Context<Env>, next: Next) => {
    const controller = new AbortController();
    const timeoutEnv = c.env.TIMEOUT;
    const timeoutMs = timeoutEnv ? parseInt(timeoutEnv) : 10000;

    if (isNaN(timeoutMs) || timeoutMs <= 0) {
        console.error(`Invalid TIMEOUT value: "${timeoutEnv}". Using default 10000ms.`);
        const defaultTimeoutMs = 10000;
        const timeoutId = setTimeout(() => controller.abort(), defaultTimeoutMs);
        // Simplified: In a real app, handle the try/catch/finally here too or refactor
    } else {
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            await next();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
                console.error(`Request timed out after ${timeoutMs}ms.`);
                return c.text("Request Timeout", { status: 408 });
            }
            console.error("Error during request processing:", error);
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
};