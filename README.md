
## 配置

### API 认证密钥 (Secret)

本项目使用 API 密钥进行认证。你需要使用 Wrangler CLI 设置一个名为 `API_AUTH_KEY` 的 Secret。

1.  确保你已经登录 Cloudflare:
    ```bash
    npx wrangler login
    ```
2.  设置 Secret (Wrangler 会提示你输入密钥值):
    ```bash
    npx wrangler secret put API_AUTH_KEY
    ```

    **注意:** 请使用一个强随机字符串作为你的密钥，并妥善保管。

    本地开发 (`bun run dev` 或 `npm run dev`) 时，Wrangler **默认会尝试**从 Cloudflare 拉取此 Secret。

### 本地开发覆盖 (使用 `.dev.vars`)

为了更方便地进行本地开发，或者使用与生产环境不同的密钥，你可以创建一个 `.dev.vars` 文件在项目的根目录。

```
# .dev.vars (此文件不应提交到 Git)
API_AUTH_KEY="YOUR_LOCAL_SECRET_KEY_HERE"
# 可以添加其他本地开发需要的环境变量
```

*   将 `"YOUR_LOCAL_SECRET_KEY_HERE"` 替换为你本地开发使用的密钥。
*   `wrangler dev` (以及 `bun run dev`) 会自动加载此文件。
*   `.dev.vars` 文件中的变量会**覆盖**从 Cloudflare 拉取的同名 Secret（仅在本地开发时生效）。
*   确保 `.dev.vars` 文件已添加到你的 `.gitignore` 文件中，以防意外提交。

## 数据库迁移 (Database Migrations)

本项目使用 Prisma 进行数据库 schema 管理，并结合 Wrangler 将迁移应用到 Cloudflare D1 数据库。

### 1. 创建迁移

当你修改了 `prisma/schema.prisma` 文件后，需要创建一个新的迁移文件来记录这些更改：

```bash
# 替换 <migration_name> 为描述性名称，例如 add_user_email
npx prisma migrate dev --name <migration_name>
```

这个命令会：
*   在 `migrations` 目录下生成一个新的 SQL 文件。
*   **自动**将迁移应用到你的**本地**开发数据库（由 `DATABASE_URL` 在 `.dev.vars` 或环境变量中定义，通常指向一个本地 SQLite 文件）。

### 2. 应用迁移到 Cloudflare D1

**本地开发环境:**

如果你想在本地使用 Wrangler 模拟的 D1 环境进行测试（而不是直接操作本地 SQLite 文件），可以运行：

```bash
# 替换 <database_name> 为 wrangler.jsonc 中定义的 database_name
# 例如：cf-gemini-db
npx wrangler d1 migrations apply <database_name> --local
```

**生产环境 (部署后):**

在将代码部署到 Cloudflare Workers 之后，你需要将迁移应用到**远程**的 D1 数据库：

```bash
# 替换 <database_name> 为 wrangler.jsonc 中定义的 database_name
# 例如：cf-gemini-db
npx wrangler d1 migrations apply <database_name> --remote
```

**重要:** 确保在部署新代码（如果代码依赖于新的数据库结构）**之前或之后**立即运行远程迁移，以避免因数据库结构不匹配导致运行时错误。
