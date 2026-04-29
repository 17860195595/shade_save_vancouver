# ShadeSafe Vancouver

[中文](#中文) · [English](#english)

---

## 中文

面向温哥华的 **热应激风险 MVP**：在地图上展示公园点位、树荫与建筑阴影估算、Open-Meteo 天气、社区举报与热力层，并基于简单模型给出 LOW / MODERATE / HIGH 风险提示。

### 功能概览

- **地图**：Leaflet + OpenStreetMap；公园为绿色图钉（温哥华开放数据 `parks`）；视口内城市树木点；热力层随时间滑块与举报更新。
- **详情抽屉**：单点逐小时风险条、行程建议文案、天气与荫蔽来源说明。
- **定位与提醒**：浏览器定位；在公园附近且模型为 HIGH 时顶部横幅；Alerts 页可查看本机最近一次 HIGH 记录（`localStorage`）。
- **举报**：`too_hot` / `great_shade` / `needs_structure`，写入 MongoDB，并参与热力层。

### 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js ≥ 18 |
| 服务端 | Express、Mongoose（MongoDB） |
| 前端 | 静态资源 + ES Modules；Bootstrap 5、Leaflet、leaflet.heat、SunCalc（CDN） |
| 空间 / 天气 | 自建荫蔽服务（SunCalc + 开放数据树木/建筑缓存）、Open-Meteo |

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- 可访问的 **MongoDB**（本地或 Atlas 等）。应用启动时会连接数据库；举报 API 依赖数据库。

### 快速开始

```bash
cd shadesafe
npm install
```

在 `shadesafe` 目录创建 `.env`（至少包含 MongoDB，见下节），并确保 MongoDB 已运行。

```bash
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:3000`）。生产环境可使用：

```bash
npm start
```

### 环境变量

在 `shadesafe/.env` 中配置（示例）：

| 变量 | 说明 | 默认 |
|------|------|------|
| `MONGODB_URI` | MongoDB 连接串 | `mongodb://localhost:27017/shadesafe` |
| `PORT` | HTTP 端口 | `3000` |

不要将含密码的 `.env` 提交到版本库。

### npm 脚本

| 命令 | 说明 |
|------|------|
| `npm start` | 启动服务（`node server.js`） |
| `npm run dev` | 开发模式（`nodemon`，忽略 `public/` 变更触发的重启） |
| `npm run clear-legacy-locations` | 可选：删除 MongoDB 中旧版 `Location` 集合文档（当前公园数据来自内存开放数据，非该集合） |

### 项目结构（摘要）

```
shadesafe/
├── server.js                 # 入口：连接 Mongo、拉取开放数据缓存、挂载路由与静态资源
├── package.json
├── models/
│   ├── Report.js             # 举报模型（运行时使用）
│   └── Location.js           # 遗留模型，仅维护脚本使用
├── routes/                   # HTTP 路由
├── services/                 # 树木、建筑、公园、天气、荫蔽等业务逻辑
├── utils/                    # 共享小工具（如查询参数解析）
├── scripts/
│   └── clearLegacyLocations.js
└── public/                   # 前端静态文件
    ├── index.html
    ├── about.html
    ├── css/style.css
    └── js/
        ├── map.js            # 地图与主界面逻辑
        ├── heatmap.js
        ├── risk.js
        ├── weatherClient.js
        ├── advisory.js
        ├── report.js
        ├── lastHighAlert.js
        └── lib/              # 时间与地理等纯函数
```

### HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 服务、Mongo 连接状态、开放数据缓存规模、天气摘要 |
| GET | `/api/weather` | 天气；支持 `lat`、`lng`、`hour` 查询逐小时格点 |
| GET | `/api/shade/at` | 查询点荫蔽分（`lat`、`lng`、`hour`） |
| GET | `/api/trees/bounds` | 视口内树木（`south/west/north/east`，`limit`） |
| GET | `/api/locations` | 公园列表（含按小时荫蔽剖面）；可选 `hour` |
| GET | `/api/locations/:id` | 单个公园 |
| GET | `/api/reports` | 最近 24 小时举报 |
| POST | `/api/reports` | 创建举报，body：`{ reportType, coordinates: { lat, lng } }` |

静态页面由 Express 直接提供，无单独 SPA 构建步骤。

### 数据与数据库

- **公园点位**：启动时从 [温哥华开放数据 · parks](https://opendata.vancouver.ca/) 拉取并缓存在内存。
- **树木 / 建筑**：启动时拉取开放数据样本，用于荫蔽估算（详见 `services/`）。
- **MongoDB**：仅 **举报（Report）** 在运行时读写。若连接失败，进程会退出。
- **遗留 `Location` 集合**：若曾有过旧种子数据，可用 `npm run clear-legacy-locations` 清理；与当前地图公园列表无关。

### 免责声明

本应用为演示与信息辅助用途，**不构成医疗或职业安全建议**。高温风险模型为简化估算，请结合实际天气与官方指引判断。

### 许可证

若仓库根目录未另行声明，以项目所有者选择的许可证为准。

---

## English

A **heat-stress risk MVP** for Vancouver: map of parks, tree- and building-shadow estimates, Open-Meteo weather, community reports and a heat layer, with a simple model that surfaces LOW / MODERATE / HIGH guidance.

### Features

- **Map**: Leaflet + OpenStreetMap; parks as green pins (Vancouver open data `parks`); city trees in the current viewport; heat layer updates with the time slider and reports.
- **Detail sheet**: hourly risk bars per location, trip-advisory copy, weather and shade provenance.
- **Location & alerts**: browser geolocation; top banner when the model is HIGH near a park; Alerts tab shows the latest HIGH event on this device (`localStorage`).
- **Reports**: `too_hot` / `great_shade` / `needs_structure`, stored in MongoDB and fed into the heat layer.

### Stack

| Layer | Tech |
|------|------|
| Runtime | Node.js ≥ 18 |
| Server | Express, Mongoose (MongoDB) |
| Client | Static assets + ES modules; Bootstrap 5, Leaflet, leaflet.heat, SunCalc (CDN) |
| Geo / weather | Custom shade service (SunCalc + cached open-data trees/buildings), Open-Meteo |

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A reachable **MongoDB** instance (local, Atlas, etc.). The app connects on startup; the reports API depends on the database.

### Quick start

```bash
cd shadesafe
npm install
```

Create `.env` in the `shadesafe` folder (at least MongoDB — see below) and ensure MongoDB is running.

```bash
npm run dev
```

Open the URL printed in the terminal (default `http://localhost:3000`). For production-style runs:

```bash
npm start
```

### Environment variables

Configure in `shadesafe/.env` (example):

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/shadesafe` |
| `PORT` | HTTP port | `3000` |

Do not commit `.env` files that contain secrets.

### npm scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the server (`node server.js`) |
| `npm run dev` | Dev mode (`nodemon`; ignores `public/` file changes for restarts) |
| `npm run clear-legacy-locations` | Optional: delete legacy `Location` collection docs (park pins today come from in-memory open data, not this collection) |

### Project layout (summary)

```
shadesafe/
├── server.js                 # Entry: Mongo connect, open-data caches, routes, static files
├── package.json
├── models/
│   ├── Report.js             # Report model (used at runtime)
│   └── Location.js           # Legacy model; maintenance script only
├── routes/                   # HTTP routers
├── services/                 # Trees, buildings, parks, weather, shade
├── utils/                    # Shared helpers (e.g. query parsing)
├── scripts/
│   └── clearLegacyLocations.js
└── public/                   # Frontend static files
    ├── index.html
    ├── about.html
    ├── css/style.css
    └── js/
        ├── map.js            # Map + main UI
        ├── heatmap.js
        ├── risk.js
        ├── weatherClient.js
        ├── advisory.js
        ├── report.js
        ├── lastHighAlert.js
        └── lib/              # Pure helpers (time, geo, …)
```

### HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Service status, Mongo state, open-data cache sizes, weather snapshot |
| GET | `/api/weather` | Weather; optional `lat`, `lng`, `hour` for hourly grid |
| GET | `/api/shade/at` | Shade score at a point (`lat`, `lng`, `hour`) |
| GET | `/api/trees/bounds` | Trees in bbox (`south`/`west`/`north`/`east`, `limit`) |
| GET | `/api/locations` | Park list (hourly shade profile); optional `hour` |
| GET | `/api/locations/:id` | Single park |
| GET | `/api/reports` | Reports from the last 24 hours |
| POST | `/api/reports` | Create report; body: `{ reportType, coordinates: { lat, lng } }` |

Static HTML is served by Express; there is no separate SPA build step.

### Data & database

- **Parks**: Fetched at startup from [City of Vancouver open data · parks](https://opendata.vancouver.ca/) and held in memory.
- **Trees / buildings**: Open-data samples loaded at startup for shade estimation (see `services/`).
- **MongoDB**: Only **reports (`Report`)** are read/written at runtime. If the connection fails, the process exits.
- **Legacy `Location` collection**: If you still have old seeded documents, run `npm run clear-legacy-locations`; this is unrelated to the current park list on the map.

### Disclaimer

This app is for demonstration and informational support only; it is **not medical or occupational-safety advice**. The heat-risk model is a simplified estimate — always cross-check with real conditions and official guidance.

### License

Unless otherwise stated at the repository root, follow the license chosen by the project owner.
