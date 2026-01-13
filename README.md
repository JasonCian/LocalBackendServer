# 本地轻量级后端自用服务器

纯 Node.js 核心模块 + 少量依赖（ws、telegram、node-cron）构建的轻量级后端，覆盖文件服务、Markdown 渲染、上传/删除、搜索、实时推送、系统监控与可选的 Telegram/PowerShell 扩展。

## ✨ 核心特性

- 多目录静态文件浏览，目录索引可开关，Markdown 渲染支持主题/原文模式，内置缓存与范围请求
- 上传/删除 API（PicList 兼容），单文件 50MB、单次 80MB，危险扩展阻断，路径严格校验
- WebSocket `/ws` 推送：文件监听、Telegram 状态等；指标端点 `/api/metrics`、健康检查 `/api/health`
- 可选服务：Telegram 多账号+任务调度、PowerShell 历史管理、文件服务 UI、系统监控（支持 SSE）
- 起始页与站内搜索：可配置搜索引擎/书签，Bing 每日壁纸代理 `/api/bing-daily`
- TLS 支持 PFX 或 key/cert，支持并行 HTTP 或 HTTP->HTTPS 重定向
- Windows 服务脚本（NSSM），启动/异常均写入日志并可推送通知

## 🛠️ 运行要求

- Node.js >= 18
- `npm install` 安装依赖（ws、telegram、node-cron）

## 🚀 快速开始

1) 复制配置样例并按需修改

```powershell
Copy-Item config.json.example config.json
```

2) 安装依赖并启动

```bash
npm install
npm start
# 或 node server.js
```

3) 访问入口

- 起始页：`http://<host>:<port>/`
- WebSocket：`ws://<host>:<port>/ws`

## ⚙️ 配置总览（config.json）

配置由分组字段驱动，访问嵌套字段前均做安全检查，TLS/服务为可选。下方示例覆盖常用字段：

```json
{
  "server": {
    "port": 8080,
    "host": "0.0.0.0",
    "cors": true,
    "showIndex": true,
    "projectName": "Local Backend",
    "tls": {
      "enabled": false,
      "port": 443,
      "pfx": "./certs/localhost.pfx",
      "passphrase": "",
      "key": "./certs/localhost.key",
      "cert": "./certs/localhost.crt",
      "redirectHttp": false,
      "enableHttp": false,
      "httpPort": 80
    }
  },
  "paths": {
    "directories": [
      { "route": "/", "path": "./public" },
      { "route": "/data", "path": "./data" }
    ],
    "uploadDir": "./data/uploads",
    "assets": {
      "enabled": true,
      "mount": "/public",
      "path": "./public",
      "cacheMaxAge": 3600
    }
  },
  "features": {
    "markdown": { "enabled": true, "theme": "anonymous-dark" },
    "startpage": {
      "searchEngines": ["https://www.bing.com/search?q=%s"],
      "defaultSearchEngine": 0,
      "bookmarks": [{ "name": "Docs", "url": "/docs" }],
      "useBingDaily": true,
      "customBackground": ""
    }
  },
  "services": {
    "telegram": {
      "enabled": false,
      "apiId": 123456,
      "apiHash": "replace_me",
      "mount": "/telegram"
    },
    "powershellHistory": { "enabled": false, "mount": "/psh" },
    "fileService": { "enabled": false, "mount": "/file" },
    "systemMetrics": {
      "enabled": false,
      "mount": "/metrics",
      "sampleIntervalMs": 250,
      "historySeconds": 60,
      "topN": 5,
      "allowSSE": true,
      "token": "",
      "netInterface": ""
    },
    "notifications": []
  }
}
```

更多字段默认值与验证逻辑见 [src/config.js](src/config.js)。TLS 启用时需存在 PFX 或 key/cert；`tls.enableHttp` 可并行开启纯 HTTP，`tls.redirectHttp` 可做 80→443 跳转。

## 🔌 核心端点速览

- 文件浏览：按 `paths.directories` 映射；Markdown 支持 `?theme=`、`?raw=1`
- 上传：POST `/upload`，多文件 multipart，PicList 或详细格式；单文件 50MB，单次 80MB
- 删除：POST `/delete`，仅允许映射目录内路径（含 URL/相对路径混合列表）
- 搜索：GET `/search?q=keyword`（Markdown 内容）
- 健康/指标：GET `/api/health`，GET `/api/metrics`，GET `/api/ws/info`
- Bing 每日图代理：GET `/api/bing-daily`
- WebSocket：`/ws` 单一入口
- Telegram（可选，挂载见 `services.telegram.mount`）：多账号登录、即时发送、任务 CRUD、健康检查、UI 页面
- PowerShell History（可选）：历史记录/规则/快捷命令管理，UI + API
- 文件服务 UI（可选）：目录操作前端入口
- 系统监控（可选，默认 `/metrics`）：JSON/SSE，详情见 [docs/system-metrics.md](docs/system-metrics.md)

完整参数与示例响应请查阅 [docs/api-reference.md](docs/api-reference.md)。

## 📂 目录速览

- [server.js](server.js) 主入口：加载配置、初始化服务与 WebSocket、处理 TLS 与通知
- [src/routes/router.js](src/routes/router.js) 统一路由分发，含健康检查/指标/搜索/静态资源
- [src/routes/file-routes.js](src/routes/file-routes.js) 文件与 Markdown 提供，含缓存与范围请求
- [src/routes/upload-routes.js](src/routes/upload-routes.js) 上传限流与扩展阻断
- [src/routes/delete-routes.js](src/routes/delete-routes.js) 删除请求与路径校验
- [src/routes/telegram-routes.js](src/routes/telegram-routes.js) Telegram 多账号 API 与页面
- [src/routes/powershell-history-routes.js](src/routes/powershell-history-routes.js) PowerShell 历史接口
- [src/routes/system-metrics-routes.js](src/routes/system-metrics-routes.js) 进程/系统指标输出
- [src/services/service-factory.js](src/services/service-factory.js) 服务初始化、挂载点解析、生命周期管理

## 🔒 安全与限制

- 路径安全：`path.normalize` + 基路径校验，文件名 `path.basename` 清洗
- 上传阻断：危险扩展 (.exe/.bat/.cmd/.sh/.ps1/.js/.mjs/.cjs) 拒绝，超限返回 413
- 目录白名单：仅 `paths.directories` 下文件可访问/删除；上传目录与映射目录均逐级校验
- HTML 输出：统一 `escapeHtml` 防 XSS；响应默认 `application/json; charset=utf-8`

## 🧭 Windows 服务

- 安装：`./install-service-nssm.ps1 -ServiceName LocalBackendServer`
- 重启：`./restart-service.ps1`
- 卸载：`./uninstall-service.ps1`

## 📝 日志与数据

- 运行日志：`logs/service.log`
- 性能统计：`/api/metrics`（含缓存命中、请求成功率）
- 数据文件：`data/`（Telegram 会话/任务、PowerShell 记录等），请备份

## 🆕 版本提示

- v0.3.x：Telegram 多账号 + 任务；文件监听推送；配置分组化；起始页/搜索；可选系统监控
- v0.2.x：基础文件服务、Markdown、上传/删除、单账号 Telegram

## 🤝 开发约定

- 不使用 Express/Koa；路由/服务函数显式依赖注入（config/appRoot/logger/wsManager）
- 路径安全、配置驱动、可选依赖降级优先；前端资源从 `paths.assets` 提供

感谢 Marked.js、highlight.js、KaTeX、GramJS、node-cron、NSSM 等开源项目。
