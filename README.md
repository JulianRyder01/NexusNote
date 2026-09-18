# AplusNexus

> 一个密码保护的、全球可访问的个人卡片网络。
> 用 `#标签` 连接一切，用看板管理 todo，用图谱看见关系。

**核心理念**：不冻结、不分类、不丢弃。每条记录都是一个节点，标签是边，图谱是网。
你不需要决定它属于哪个文件夹，只需要写下来，打上 `#标签`，网络自己会生长。

当前版本：`0.0.1`（第二阶段开发中）

---

## 环境要求

- Node.js ≥ 20（本机实测 v24.21.0）
- npm ≥ 10
- 数据库使用 Node 内置 `node:sqlite`，**无需原生编译**

### 关于本机的一个特殊约束（重要）

本仓库位于 `/sdcard/DevelopTab/AplusNexusTodo`，而 `/sdcard` 是 **FUSE 挂载**，具有以下限制：

| 限制 | 影响 |
|---|---|
| 挂载带 `noexec` | 原生二进制（esbuild、vite 等）**无法执行** |
| 不支持符号链接 | `npm install` 无法创建 `node_modules/.bin/*`，安装必然失败 |
| 小文件写入慢约 13× | 即使装成功也极慢 |

因此本项目采用**软链桥接（run mirror）**方案：

- **源码唯一真源**保留在仓库内（即本目录），纳入 git 管理；
- 真实 `node_modules` 安装在 `/home/julian/AplusNexusRun`（f2fs，支持 exec 与软链）；
- 该目录把仓库顶层条目以符号链接桥接过去，`vite`/`tsx` 从那里启动、实时读取仓库源码；
- 数据库文件可直接放在仓库 `data/`（实测 FUSE 上 SQLite 的 WAL 与 FTS5 均正常）。

> 换到普通机器（如服务器、桌面）时无需这套镜像：直接 `npm install && npm run dev` 即可。

---

## 快速开始

```bash
# 1. 准备运行镜像并安装依赖（首次约 2–3 分钟）
npm run setup

# 2. 启动开发环境（后端 :3001 + 前端 :5173，并行）
npm run dev
```

打开 http://127.0.0.1:5173 即可。

**默认访问密码**：`aplusnexus`（在 `.env` 中设置 `APLUSNEXUS_PASSWORD` 修改）。
生产部署务必同时设置 `JWT_SECRET`（未设置时后端会拒绝启动）。

---

## 当前进度

第一阶段（MVP）已完成：

- ✅ 密码登录 + 30 天会话（httpOnly cookie + sessions 表，支持登出即失效）
- ✅ 快速输入语法：`[ ]` todo、`?`/`!` idea、`http` link、`#标签`、`[[链接]]`、`P0`~`P3` 与自定义优先级、`@今天/@明天/@周X/@M-D/@M月D日`
- ✅ 卡片 CRUD（详情弹窗支持 Markdown 预览、类型/优先级/状态/标签/due 编辑）
- ✅ 看板视图（列 = 优先级，拖拽跨列改优先级，列可增删/改名/排序/折叠）
- ✅ 列表视图（全文+多条件筛选、批量操作、按标签分组折叠）
- ✅ SQLite 数据库（含标签共现边 `tag_edges` 与显式链接 `card_links` 的自动维护）
- ✅ 快捷键：`N` 聚焦输入、`B/L/G/T/R` 切换视图、`/` 聚焦搜索、`Esc` 关闭弹窗

后续阶段（图谱、标签管理、每日回顾、随机漫游、导出备份、PWA、暗色）为规划中，
界面已预留导航入口。

### 其他命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 并行启动 Fastify 后端与 Vite 前端 |
| `npm run setup` | 建立运行镜像并安装依赖 |
| `npm run build` | 类型检查 + 构建前端到 `dist/` |
| `npm run preview` | 构建后由后端托管静态文件预览 |
| `npm run typecheck` | 仅做 TypeScript 类型检查 |
| `npm run dev:web` / `npm run dev:server` | 单独启动前端 / 后端 |

若需更改运行镜像位置，设置环境变量 `APLUSNEXUS_RUN_DIR`。

---

## 目录结构

```
.
├── index.html            # Vite HTML 入口
├── vite.config.ts        # Vite 配置（含 /api 代理到后端）
├── tsconfig.json         # TypeScript 配置（前端 + 后端共用）
├── shared/               # 前后端共享代码（类型、解析器、常量）
├── server/               # Fastify 后端
├── src/                  # React 前端
├── public/               # 静态资源
├── scripts/              # 运行镜像与开发脚本
└── data/                 # SQLite 数据库（运行时生成，不入库）
```

---

## 开发路线图

### 第一阶段：MVP
- [ ] 密码登录 + 30 天会话
- [ ] 快速输入（`#标签` 识别）
- [ ] 卡片 CRUD
- [ ] 看板视图（P0–P3）
- [ ] 列表视图
- [ ] SQLite 数据库

### 第二阶段：连接
- [ ] 图谱视图（标签共现）
- [ ] 标签管理
- [ ] 显式链接 `[[卡片]]`
- [ ] 优先级自定义
- [ ] 搜索 + 筛选

### 第三阶段：体验
- [ ] 每日回顾
- [ ] 随机漫游
- [ ] 暗色模式
- [ ] PWA + Share Target
- [ ] 导出 JSON / Markdown

### 第四阶段：打磨
- [ ] 自动备份
- [ ] 快捷键
- [ ] 移动端优化
- [ ] 标签颜色自动分配
- [ ] 图谱聚焦模式
- [ ] 数据统计面板

---

## 版本与发版约定

- 版本号记录在 `shared/meta.ts` 的 `APP_VERSION`。
- 日常仅可递增末位：`0.0.x`；**发版时机与较大版本号变更由维护者决定**。
