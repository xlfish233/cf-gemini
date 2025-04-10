# 项目技术栈总结

本项目主要使用了以下技术：

*   **框架**: Hono (`hono`)
*   **运行时**:
    *   Cloudflare Workers (`@cloudflare/workers-types`, `wrangler`) - 用于生产部署
    *   Bun - 用于本地开发 (`package.json` script `dev:local`)
*   **语言**: TypeScript (`tsconfig.json`)
*   **包管理器**: Bun (`bun.lock`)
*   **构建/部署/开发工具**:
    *   Wrangler (`wrangler.jsonc`, `package.json` scripts) - 用于 Cloudflare 部署和开发
    *   `dotenv` - 用于加载本地环境变量 (`.env`)
    *   环境变量: `API_AUTH_KEY`, `TARGET_API_HOST` (本地和 Cloudflare), `PROXY_STREAMING_RESPONSE` (Cloudflare)
*   **JSX**: Hono JSX (`tsconfig.json`)
*   **ORM**: Prisma (`@prisma/client`)
*   **数据库**:
    *   Cloudflare D1 (通过 `@prisma/adapter-d1`) - 用于生产部署
    *   SQLite (`dev.db`) - 用于本地开发