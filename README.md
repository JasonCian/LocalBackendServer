# 本地轻量级后端自用服务器

纯 Node.js 核心模块 + 少量依赖（ws、telegram、node-cron）构建的轻量级后端，涵盖文件浏览、Markdown 渲染、上传/删除、实时推送、系统监控及可选的 Telegram、PowerShell 扩展。

**重要提示：本后端以作者个人自用场景为主，默认配置（端口、权限、开放目录等）偏向局域网与信任环境，面向公网请务必重新审视安全策略（端口、防火墙、TLS、token、目录白名单等）并做最小化暴露。**

## 为什么这份 README 更长

仓库忽略了若干关键文件与目录，用户拉取代码后需要自行准备：
- config.json：运行时配置，需从样例复制并按环境修改。
- data/：运行时数据（Telegram 会话与任务、PowerShell 记录、上传文件等），需手动创建并备份。
- certs/：TLS 证书目录（pfx 或 key/cert）。
- logs/：运行日志输出目录。
- package-lock.json：未提交，需本地生成。
- scripts/、tests/、.github/ 等辅助目录未包含在仓库中。

下文给出可操作的部署、配置与运行步骤，避免缺失文件导致的困惑。

## 运行要求

- Node.js >= 18
- 网络可访问 npm registry
- 可写磁盘用于 data/ 与 logs/

## 快速开始（本地）

1) 复制配置并编辑
   - Windows：`Copy-Item config.json.example config.json`
   - Linux/macOS：`cp config.json.example config.json`
   - 按下方配置指南调整端口、目录、可选服务。

2) 安装依赖并启动
   - `npm install`
   - `npm start` 或 `node server.js`

3) 访问入口
   - 起始页：http://<host>:<port>/
   - WebSocket：ws://<host>:<port>/ws

## 配置指南（config.json）

配置由分组字段驱动，默认值与校验逻辑见 [src/config.js](src/config.js)。建议从 [config.json.example](config.json.example) 开始：

- server
  - host/port：监听地址与端口。
  - cors、showIndex：是否允许跨域 / 目录列表。
  - projectName：启动日志与通知标题。
  - tls：可选，支持 pfx 或 key/cert。`enableHttp` 可并行开启纯 HTTP，`redirectHttp` 可做 80→443 跳转（与 enableHttp 互斥）。
- paths
  - directories：路由与本地路径映射。示例 `/` -> `./public`，`/uploads` -> `./data/uploads`。
  - uploadDir：上传默认落盘位置，未设定时按 directories 回落。
  - assets：静态资源挂载点（默认 /public）。
- features
  - markdown：开关与默认主题，可通过 `?theme=` 或 `?raw=1` 调整。
  - startpage：搜索引擎、书签、壁纸设置。
- services（可选）
  - telegram：多账号、任务调度；需 apiId/apiHash，并准备 session 与任务文件位置（data/ 目录）。
  - powershellHistory：Windows PSReadLine 历史管理；需指定 historyPath。
  - fileService：文件服务前端挂载。
  - systemMetrics：进程/系统指标，支持 JSON/SSE；可设 token 限制访问。
  - notifications：钉钉/飞书/Webhook 列表，用于启动或异常推送。

TLS 证书放置示例：
- pfx 模式：certs/localhost.pfx（可配合 passphrase）。
- key/cert 模式：certs/localhost.key、certs/localhost.crt，可选 CA 链。

## 目录与文件约定

- public/：默认静态资源与前端页面（Markdown 主题、Telegram 多账号 UI 等）。
- data/：运行数据与上传文件，需手动创建；Telegram 与 PowerShell 配置/会话文件默认放在此处。
- logs/service.log：运行日志文件，需确保目录可写。
- certs/：自备证书；未提供默认证书。
- nssm/、install-service-nssm.ps1 等：用于 Windows 服务安装。

## 运行与部署

- 开发/测试：`npm start`，确认端口未被占用。
- 生产守护：可配合进程管理器（如 pm2）或使用 Windows NSSM 脚本：
  - 安装：`./install-service-nssm.ps1 -ServiceName LocalBackendServer`
  - 重启：`./restart-service.ps1`
  - 卸载：`./uninstall-service.ps1`
- 防火墙/端口：开放 server.port 以及可选 tls.port/httpPort。

## 核心端点与能力

- 文件浏览：按 paths.directories 映射；Markdown 支持 `?theme=`、`?raw=1`。
- 上传：POST /upload（multipart），单文件 50MB、单次 80MB，阻断危险扩展。
- 删除：POST /delete（PicList 兼容），仅允许映射目录内路径。
- 搜索：GET /search?q=keyword（Markdown 内容）。
- 健康/指标：GET /api/health，GET /api/metrics，GET /api/ws/info。
- WebSocket：/ws（文件变更、Telegram 状态等推送）。
- 可选模块：
  - Telegram：UI + API（多账号登录、健康检查、即时发送、任务 CRUD/执行），挂载见 services.telegram.mount。
  - PowerShell History：历史与规则管理，挂载见 services.powershellHistory.mount。
  - 文件服务 UI：挂载见 services.fileService.mount。
  - 系统监控：JSON/SSE，挂载见 services.systemMetrics.mount，详见 [docs/system-metrics.md](docs/system-metrics.md)。

## 安全与运行注意

- 路径安全：统一 path.normalize 与基路径校验，文件名使用 path.basename 清洗。
- 上传限制：阻断 .exe/.bat/.cmd/.sh/.ps1/.js/.mjs/.cjs，超限返回 413。
- 数据备份：备份 data/（会话、任务、上传文件）与 config.json；证书放在 certs/。
- 日志：logs/service.log 持续追加，必要时轮转或清理。
- CORS：根据部署场景调整 server.cors。
- Token：为 systemMetrics 配置访问 token，避免暴露主机指标。

## 故障排查

- 端口占用：启动日志若提示 EADDRINUSE，请修改 config.json 中的 port/tls.port/httpPort。
- TLS 失败：确认 pfx 或 key/cert 路径正确且文件存在；仅启用一套证书配置。
- WebSocket 不通：检查反向代理是否转发 upgrade；路径必须是 /ws。
- 上传/删除失败：确认路径在 paths.directories 内，或 uploadDir 可写。

## 参考

- 配置默认值与校验：见 [src/config.js](src/config.js)。
- 路由入口：见 [server.js](server.js)、[src/routes/router.js](src/routes/router.js)。
- API 细节与示例：见 [docs/api-reference.md](docs/api-reference.md)。
