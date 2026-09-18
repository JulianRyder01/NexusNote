# AGENTS.md — AplusNexus 协作约定

本文件面向在此仓库工作的 AI agent 与协作者。**开始任何改动前请先读完。**

## 项目

- 名称：**AplusNexus**（不要写回 Nexus）
- 版本：见 `shared/meta.ts` 的 `APP_VERSION`
- 定位：密码保护的、全球可访问的个人卡片网络。用 `#标签` 连接一切，看板管 todo，图谱看关系。

## 硬性规则

1. **版本号**：平时改动只可递增末位（`0.0.x` → `0.0.1`）。**发版由维护者决定**，不得自行变更主/次版本号。
2. **每次完成一个功能即 commit**，保持工作区干净。禁止把多个不相关功能塞进同一提交。
3. **及时清理冗余过程文件**：探针、临时脚本、调试输出一律删除，不得留在仓库里。
4. **需要决策时先问**：遇到无法从代码/文档推断的取舍（技术选型、范围、破坏性变更），用提问工具确认，不要擅自决定。
5. 提交信息用**中文或英文**均可，格式为 `type(scope): 描述`，例如 `feat(web): kanban view`。

## 环境约束（务必牢记）

本仓库位于 `/sdcard`（**FUSE 挂载**）：

- 挂载带 **`noexec`** → esbuild/vite 等原生二进制**无法在此执行**；
- **不支持符号链接** → 直接在仓库内 `npm install` 必然失败（`EACCES symlink`）；
- 小文件写入比 f2fs 慢约 13×。

**因此**：源码真源在仓库，依赖与运行在运行镜像 `/home/julian/AplusNexusRun`（由 `scripts/run-env.sh` 维护）。
凡是要跑构建/开发服务器的操作，都应通过 `npm run dev` / `npm run setup` 等脚本，而**不要**在仓库根目录直接 `npm install`。

- 数据库可放在仓库 `data/`（FUSE 上 SQLite 的 WAL 与 FTS5 实测正常）。
- `bash` 可写 `/home`，但编辑工具只能写仓库内文件；因此运行镜像侧的文件由脚本生成。

## 技术栈

- 前端：React 18 + Vite + Tailwind CSS v4 + Zustand + react-markdown + dnd-kit
- 后端：Fastify + `node:sqlite`（**内置，不要引入 better-sqlite3**，原生编译在本机不可行）
- 语言：TypeScript（前后端共用 `tsconfig.json`）
- 路径别名：`@/*` → `src/*`，`@shared/*` → `shared/*`

## 代码组织

```
shared/   前后端共享：类型、解析器（#标签 / [[链接]] / 优先级 / due date）、常量
server/   Fastify 后端：db、routes、auth、services
src/      React 前端：components、views、store、api、lib
scripts/  运行镜像与开发脚本（仓库在 FUSE 上的必需基础设施）
```

**解析器必须只有一份**（放 `shared/`），前后端共用，避免语法识别逻辑漂移。

## 设计约定

- 极简，留白多。主色 `#1e2b3a`，强调色 `#4a6fa5`，卡片圆角 6px，阴影轻。
- 标签颜色从柔和调色板自动分配，可手动覆盖。
- Markdown 渲染**禁用原始 HTML**。
- 支持暗色模式与中英双语（后续阶段）。

## 提交前自检

- [ ] `npm run typecheck` 通过
- [ ] 相关功能已手工验证
- [ ] 工作区无临时/探针文件
- [ ] `git status` 干净
