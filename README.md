# Cloudflare Worker API 密钥管理与代理

本项目是一个部署在 Cloudflare Workers 上的 Hono 应用，提供 API 密钥管理功能，并能作为通用代理转发请求。它使用 Cloudflare D1 作为数据库，Prisma 进行 ORM 和迁移管理。

## ✨ 功能

*   创建、读取、删除 API 密钥。
*   跟踪每个 API 密钥的使用情况（可选，基于模型）。
*   根据使用情况来选择最佳密钥。
*   通过 Worker 代理转发请求到目标 API。
*   使用 `x-goog-api-key` 进行管理 API 的认证。
*   使用管理的 API 密钥认证代理请求。

## 🚀 先决条件

在开始之前，请确保你已安装以下工具：

*   [Node.js](https://nodejs.org/) (建议使用 LTS 版本)
*   [Bun](https://bun.sh/) (用于包管理和本地开发)
*   [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/) (Cloudflare Workers 开发工具)
*   一个 [Cloudflare 账户](https://dash.cloudflare.com/sign-up)

## 🛠️ 安装与配置

1.  **克隆仓库**:
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **安装依赖**:
    ```bash
    bun install
    ```

3.  **配置环境变量与绑定**:

    *   **API 管理认证密钥 (`API_AUTH_KEY`)**:
        这是用于保护 `/keys` 管理端点的密钥。
        *   **生产环境**: 使用 Wrangler 设置 Secret。Wrangler 会提示你输入密钥值。请使用强随机字符串并妥善保管。
            ```bash
            npx wrangler secret put API_AUTH_KEY
            ```
        *   **本地开发**: 在项目根目录创建 `.dev.vars` 文件 (确保已添加到 `.gitignore`)，并设置本地密钥：
            ```
            # .dev.vars
            API_AUTH_KEY="YOUR_LOCAL_SECRET_KEY_HERE"
            # 可以添加其他本地开发需要的环境变量, 例如:
            # TARGET_API_HOST="https://api.openai.com"
            ```
            `wrangler dev` 会优先加载此文件中的变量。

    *   **Cloudflare D1 数据库**:
        *   **创建数据库**: 如果你还没有 D1 数据库，请创建一个：
            ```bash
            # 替换 <database_name> 为你想要的名称，例如 cf-gemini-db
            npx wrangler d1 create <database_name>
            ```
            记下输出中的 `database_id` 和 `database_name`。
        *   **配置 `wrangler.jsonc`**: 打开 `wrangler.jsonc`，在 `d1_databases` 部分配置绑定信息：
            ```jsonc
            // wrangler.jsonc
            {
              // ... 其他配置 ...
              "vars": {
                // 可以在 .dev.vars 中覆盖 API_AUTH_KEY
              },
              "d1_databases": [
                {
                  "binding": "DB", // !! 必须与 src/index.ts 中的 Bindings 类型匹配 !!
                  "database_name": "<your_database_name>", // 替换为你的数据库名称
                  "database_id": "<your_database_id>",     // 替换为你的数据库 ID (用于生产)
                  "preview_database_id": "<your_preview_database_id>" // 推荐: 用于 wrangler dev --remote 的 ID，可以与 database_id 相同
                }
              ]
              // ... 其他配置 ...
            }
            ```
            **重要**: 确保 `binding` 的值 (`"DB"`) 与 `src/index.ts` 中 `Bindings` 类型里的 `DB: D1Database` 完全一致。

## 💻 本地开发

1.  **启动开发服务器**:
    ```bash
    bun run dev
    ```
    这将启动一个本地服务器 (通常在 `http://localhost:8787`)。
    *   它会自动加载 `.dev.vars` 中的环境变量。
    *   默认情况下，它会使用本地 SQLite 文件 (`.wrangler/state/v3/d1`) 模拟 D1 数据库。
    *   如果想连接到 `wrangler.jsonc` 中配置的 `preview_database_id` 指定的 **远程** D1 数据库进行测试，请使用：
        ```bash
        bun run dev --remote
        ```

2.  **数据库迁移 (本地)**:
    *   当你修改 `prisma/schema.prisma` 文件后，创建新的迁移文件：
        ```bash
        # 替换 <migration_name> 为描述性名称，例如 add_user_email
        npx prisma migrate dev --name <migration_name>
        ```
        此命令会自动将更改应用到你的**本地开发数据库** (通常是 `.wrangler/state/v3/d1` 下的 SQLite 文件)。
    *   如果你想将迁移应用到 Wrangler **本地模拟**的 D1 环境 (而不是 `prisma migrate dev` 自动处理的那个)，可以运行：
        ```bash
        # 替换 <database_name> 为 wrangler.jsonc 中定义的 database_name
        npx wrangler d1 migrations apply <database_name> --local
        ```

## ☁️ 部署到 Cloudflare Workers

1.  **部署前检查**:
    *   确保你已经使用 `npx wrangler login` 登录。
    *   确保生产环境的 `API_AUTH_KEY` Secret 已通过 `npx wrangler secret put API_AUTH_KEY` 设置在 Cloudflare 上。
    *   确保 `wrangler.jsonc` 中的 `d1_databases` 配置指向正确的**生产**数据库 `database_id` 和 `database_name`。

2.  **数据库迁移 (生产环境)**:
    如果自上次部署以来有数据库结构更改 (即创建了新的迁移文件)，你需要将这些迁移应用到**远程生产 D1 数据库**：
    ```bash
    # 替换 <database_name> 为 wrangler.jsonc 中定义的 database_name
    npx wrangler d1 migrations apply <database_name> --remote
    ```
    **重要**: 建议在运行 `wrangler deploy` **之前或之后立即**执行此操作，以确保代码和数据库结构匹配。

3.  **部署 Worker**:
    ```bash
    npx wrangler deploy
    ```
    Wrangler 会将你的代码、配置和绑定信息部署到 Cloudflare 网络。部署成功后会显示你的 Worker URL。

## ⚙️ API 使用

部署或本地运行后，你可以通过 HTTP 请求与 API 交互。

*   **管理 API (`/keys`)**: 需要在请求头中包含 `x-goog-api-key: YOUR_API_AUTH_KEY` (替换为你的管理密钥)。
*   **代理请求 (`/*`)**: 需要在请求头中包含 `Authorization: Bearer YOUR_MANAGED_API_KEY` (替换为你通过 `/keys` API 创建的有效密钥)。

`src/key.http` 文件包含了使用 VS Code REST Client 插件 或 IntelliJ HTTP Client 测试各个端点的示例请求。请根据你的环境修改 `@baseUrl` 和 `@authToken` (管理密钥)。

## 🔑 批量添加 API 密钥

项目包含一个 `addkey.ts` 脚本，可以方便地从 CSV 文件批量导入 API 密钥。

1.  **准备 `keys.csv` 文件**:
    在项目根目录创建一个名为 `keys.csv` 的文件。将你想要添加的 API 密钥放入此文件，每行一个密钥。例如：
    ```csv
    # keys.csv
    key_abc123_example
    key_def456_another_one
    key_ghi789_and_so_on
    ```

2.  **设置环境变量**:
    运行脚本前，需要设置以下环境变量，指向你的 Worker 服务地址和管理 API 密钥：
    *   `API_BASE_URL`: 你的 Worker 的 URL (例如 `https://your-worker-name.your-subdomain.workers.dev`)。
    *   `API_AUTH_KEY`: 你的管理 API 密钥 (与 `wrangler secret put API_AUTH_KEY` 或 `.dev.vars` 中设置的值相同)。

    你可以直接在终端设置：
    ```bash
    export API_BASE_URL="YOUR_WORKER_URL"
    export API_AUTH_KEY="YOUR_ADMIN_AUTH_KEY"
    ```
    或者，将它们添加到 `.dev.vars` 文件中 (Bun 会自动加载)：
    ```
    # .dev.vars
    API_BASE_URL="YOUR_WORKER_URL"
    API_AUTH_KEY="YOUR_ADMIN_AUTH_KEY"
    ```

3.  **运行脚本**:
    使用 Bun 执行脚本：
    ```bash
    bun run addkey.ts
    ```
    脚本会读取 `keys.csv` 文件，并逐个调用 `/keys` API 端点来添加密钥。它会输出每个密钥的导入状态。

## 🤝 贡献

欢迎提交问题 (Issues) 和拉取请求 (Pull Requests)。

## 📄 许可证

[MIT](./LICENSE) (如果项目有许可证文件)

## 🤣🤣🤣彩蛋
这个项目99%的代码都是由白嫖的Gemini 2.5 完成的