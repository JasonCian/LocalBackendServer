# 本地轻量级后端自用服务器

一个基于 Node.js 核心模块构建的轻量级 HTTP 文件服务器，专为个人开发者设计。

## ✨ 核心特性

- **静态文件服务** - 支持多目录映射、自动索引、MIME 类型识别
- **Markdown 渲染** - 集成 Marked.js + highlight.js + KaTeX，支持主题切换
- **文件上传/删除** - RESTful API，兼容 PicList 格式，支持 UTF-8 文件名
- **Telegram 服务** - 多账号管理、自动登录、即时消息、定时任务（Cron）
- **通知推送** - 支持钉钉、飞书、自定义 Webhook
- **CORS 支持** - 跨域资源共享
- **Windows 服务** - 通过 NSSM 实现后台运行

## 📁 项目结构

```
LocalBackendServer/
├── server.js                 # 主入口文件
├── config.json              # 配置文件
├── package.json             # 项目元数据（无本地依赖）
├── README.md                # 项目文档
├── src/                     # 源代码目录
│   ├── config.js           # 配置加载模块
│   ├── utils/              # 工具模块
│   │   ├── logger.js       # 日志工具
│   │   ├── mime.js         # MIME 类型映射
│   │   ├── html-escape.js  # HTML 转义
│   │   └── path-resolver.js # 路径解析与安全检查
│   ├── middleware/         # 中间件
│   │   ├── cors.js         # CORS 处理
│   │   └── multipart-parser.js # 文件上传解析
│   ├── views/              # 视图生成器
│   │   ├── home-page.js    # 首页
│   │   ├── directory-listing.js # 目录浏览
│   │   └── markdown-page.js # Markdown 渲染
│   ├── services/           # 服务模块
│   │   ├── notification-service.js # 通知服务
│   │   └── telegram/       # Telegram 服务
│   │       ├── telegram-service.js # 主服务
│   │       ├── telegram-session.js # 会话管理
│   │       ├── telegram-account-manager.js # 多账号管理
│   │       └── telegram-tasks.js   # 任务调度
│   └── routes/             # 路由处理器
│       ├── file-routes.js  # 文件服务
│       ├── upload-routes.js # 上传
│       ├── delete-routes.js # 删除
│       └── telegram-routes.js # Telegram API
├── public/                  # 静态资源
│   ├── css/                # 功能性样式
│   │   └── telegram-multi-account.css # Telegram 多账号UI
│   ├── themes/             # 主题文件
│   │   ├── anonymous-dark.css         # 深色主题
│   │   ├── anonymous-light.css        # 亮色主题
│   │   └── Anonymous/                 # Anonymous 主题模块
│   │       ├── Core/
│   │       ├── Syntax/
│   │       ├── UI/
│   │       ├── Components/
│   │       └── browser-adapter.css
│   └── telegram-multi-account.html    # 多账号管理界面
├── data/                    # 数据目录
│   ├── telegram-session.txt # Telegram 会话
│   └── telegram-tasks.json  # 定时任务
├── logs/                    # 日志目录
│   └── service.log         # 运行日志
└── nssm/                    # Windows 服务工具
    └── (NSSM 可执行文件)
```

## 🚀 快速开始

### 1. 配置文件

编辑 `config.json`：

```json
{
  "port": 80,
  "host": "0.0.0.0",
  "directories": [
    {
      "route": "/docs",
      "path": "D:/your/documents"
    }
  ],
  "uploadDir": "D:/your/uploads",
  "cors": true,
  "showIndex": true,
  "markdown": {
    "enabled": true,
    "theme": "anonymous-dark"
  },
  "telegram": {
    "enabled": true,
    "apiId": 12345678,
    "apiHash": "your_api_hash"
  },
  "notifications": [
    {
      "type": "dingtalk",
      "url": "https://oapi.dingtalk.com/robot/send?access_token=xxx"
    }
  ]
}
```

### 2. 本地运行

```bash
node server.js
```

访问 `http://localhost:80/`

### 3. Windows 服务模式

```powershell
# 安装服务
.\install-service-nssm.ps1 -ServiceName LocalBackendServer

# 重启服务
.\restart-service.ps1

# 卸载服务
.\uninstall-service.ps1
```

## 📖 API 文档

### 文件上传

**请求**

```http
POST /upload
Content-Type: multipart/form-data

file: (binary)
route: /docs (optional)
subdir: 2024/01 (optional)
format: piclist (optional, default: piclist)
```

**响应（PicList 格式）**

```json
{
  "success": true,
  "result": [
    "http://localhost/docs/file.png"
  ]
}
```

### 文件删除（理论兼容piclist但实际测试不行）

**请求**

```http
POST /delete
Content-Type: application/json

{
  "list": [
    "http://localhost/docs/file.png",
    "/docs/another.jpg"
  ]
}
```

**响应**

```json
{
  "success": true,
  "successCount": 2,
  "total": 2,
  "result": [...]
}
```

### Telegram API

#### 账号管理

```http
GET  /telegram/api/accounts              # 获取所有账号
POST /telegram/api/accounts              # 添加新账号
PUT  /telegram/api/accounts/:id          # 更新账号信息
DELETE /telegram/api/accounts/:id        # 删除账号
POST /telegram/api/accounts/:id/switch   # 切换活跃账号
```

#### 发送验证码

```http
POST /telegram/api/start
{"phone": "+1234567890", "accountId": "optional"}
```

#### 验证登录

```http
POST /telegram/api/verify
{"stateId": "xxx", "code": "12345", "accountId": "optional"}
```

#### 即时发送

```http
POST /telegram/api/sendNow
{"to": "username", "message": "Hello", "accountId": "optional"}
```

#### 任务管理

```http
GET  /telegram/api/tasks           # 列出任务（支持 ?accountId=xxx 筛选）
POST /telegram/api/tasks           # 创建任务
PUT  /telegram/api/tasks/:id       # 更新任务
DELETE /telegram/api/tasks/:id     # 删除任务
```

更多 API 文档参见 [TELEGRAM-MULTI-ACCOUNT.md](./docs/TELEGRAM-MULTI-ACCOUNT.md)

## 🎨 Markdown 渲染

支持的查询参数：

- `?theme=anonymous-dark` - 切换主题
- `?raw=1` - 查看原始 Markdown

支持的功能：

- GFM（GitHub Flavored Markdown）
- 代码高亮（highlight.js）
- 数学公式（KaTeX）
- 任务列表
- 相对路径图片

## 🔧 模块说明

### 工具模块（utils/）

- **logger.js** - 日志记录（控制台 + 文件）
- **mime.js** - MIME 类型映射
- **html-escape.js** - XSS 防护
- **path-resolver.js** - 路径解析与安全验证

### 中间件（middleware/）

- **cors.js** - CORS 头设置
- **multipart-parser.js** - 文件上传解析（支持 UTF-8 文件名）

### 视图生成器（views/）

- **home-page.js** - 首页 HTML
- **directory-listing.js** - 目录浏览器
- **markdown-page.js** - Markdown 渲染页面

### 服务（services/）

- **notification-service.js** - 通知推送（钉钉/飞书/自定义）
- **telegram/telegram-service.js** - Telegram 集成服务
- **telegram/telegram-session.js** - 登录会话管理
- **telegram/telegram-account-manager.js** - 多账号管理器
- **telegram/telegram-tasks.js** - Cron 任务调度

### 路由（routes/）

- **file-routes.js** - 静态文件与目录浏览
- **upload-routes.js** - 文件上传
- **delete-routes.js** - 文件删除
- **telegram-routes.js** - Telegram API

## 🛡️ 安全特性

- **路径遍历防护** - 严格的路径规范化与验证
- **文件名清理** - 防止恶意文件名
- **目录白名单** - 仅允许访问配置的目录
- **请求体大小限制** - 防止内存耗尽（10MB）
- **HTML 转义** - XSS 防护

## ⚙️ 配置选项

| 字段                 | 类型    | 说明                         |
| -------------------- | ------- | ---------------------------- |
| `port`             | number  | 监听端口                     |
| `host`             | string  | 绑定地址                     |
| `directories`      | array   | 目录映射 `[{route, path}]` |
| `uploadDir`        | string  | 默认上传目录                 |
| `cors`             | boolean | 启用 CORS                    |
| `showIndex`        | boolean | 显示目录列表                 |
| `markdown.enabled` | boolean | 启用 Markdown 渲染           |
| `markdown.theme`   | string  | 默认主题                     |
| `telegram.enabled` | boolean | 启用 Telegram                |
| `telegram.apiId`   | number  | Telegram API ID              |
| `telegram.apiHash` | string  | Telegram API Hash            |
| `notifications`    | array   | 通知目标                     |

## 📝 日志

运行日志：`logs/service.log`
服务日志：`logs/service-nssm.log`（NSSM 模式）

## 🤝 扩展开发

### 添加新服务

1. 在 `src/services/` 创建服务模块
2. 在 `src/routes/` 创建路由处理器
3. 在 `server.js` 中注册路由

### 添加 Markdown 主题

1. 在 `public/css/` 添加主题 CSS
2. 在 `src/views/markdown-page.js` 的 `availableThemes` 数组中添加主题名

## 📄 许可证

本项目为个人开发工具，供学习和自用。

## 🎨 CSS 文件组织

项目采用清晰的 CSS 文件组织结构：

### 目录映射

```
public/
├── css/                           # 功能性 CSS（非主题）
│   └── telegram-multi-account.css # Telegram 多账号管理界面样式
│
└── themes/                        # 所有主题文件
    ├── anonymous-dark.css        # 深色主题（推荐）
    ├── anonymous-light.css       # 亮色主题
    └── Anonymous/                # 主题模块库
        ├── Core/         # 核心变量和基础样式
        ├── Syntax/       # Markdown 语法样式
        ├── UI/           # 用户界面组件
        ├── Components/   # 功能组件
        └── browser-adapter.css    # 浏览器适配层
```

### 特点

- ✅ **无内联样式** - 所有样式都在外部 CSS 文件中
- ✅ **模块化主题** - Anonymous 主题拆分为可维护的子模块
- ✅ **CSS 变量** - 使用 `--anonymous-*` 变量便于自定义
- ✅ **易于扩展** - 简单添加新主题或新组件

### CSS 路径引用

```javascript
// Markdown 页面（markdown-page.js）
<link rel="stylesheet" href="/themes/${themeCss}.css">

// 功能组件（如 Telegram 管理界面）
<link rel="stylesheet" href="/css/telegram-multi-account.css">
```

详见 [CSS 文件组织文档](./docs/CSS-ORGANIZATION.md) 和 [快速参考](./docs/CSS-QUICK-REFERENCE.md)

## 版本更新

### v0.3.0 

- ✨ **Telegram 多账号支持** - 完整的多账号管理系统
  - 独立会话隔离（每个账号一个会话文件）
  - 账号列表管理、激活/切换
  - 任务可绑定特定账号执行
- ✨ **新增 telegram-account-manager.js** - 专业的多账号管理器
- 🔄 **增强的配置验证** - 更安全的嵌套属性访问

### v0.2.0

- 初始发布，包含基础文件服务、Markdown 渲染、文件上传/删除、Telegram 集成

## 致谢

- [Marked.js](https://marked.js.org/) - Markdown 解析
- [highlight.js](https://highlightjs.org/) - 代码高亮
- [KaTeX](https://katex.org/) - 数学公式渲染
- [GramJS](https://gram.js.org/) - Telegram 客户端
- [node-cron](https://www.npmjs.com/package/node-cron) - Cron 调度
- [NSSM](https://nssm.cc/) - Windows 服务管理

---

**注意**：本项目不使用 Express/Koa 等框架，不引入本地 npm 依赖（除 Telegram 可选依赖），所有前端库通过 CDN 加载。
