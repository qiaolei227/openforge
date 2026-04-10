# OpenForge 开匠

> 可本地部署、支持离线运行的低代码企业管理软件平台 —— 面向内部工具、ERP 模块和行业应用。

简体中文 | [English](./README.md)

---

## OpenForge 是什么？

**OpenForge（开匠）** 是一款可本地部署的低代码平台，让团队能通过可视化方式设计数据模型、表单、列表和工作流，并直接作为生产级应用运行。与托管型低代码产品不同，OpenForge 专为需要本地化部署、数据主权和零公网依赖的企业而设计。

LLM 能力已内置到后端架构中，同时支持本地 Ollama 和云端服务商。目前已实现模型设计中的字段建议；表单自动生成、自然语言查询、主动洞察等能力已在路线图中。

## 亮点

- **本地部署 & 离线优先** —— 字体、图标、资源全部本地打包，在防火墙后无公网也能运行
- **动态建模** —— 在界面上创建模型、添加字段，平台自动生成真实的 PostgreSQL 物理表
- **统一渲染引擎** —— 表单与列表共享同一套布局管线，支持 `preview` / `create` / `edit` / `view` 四种模式
- **多租户隔离** —— 客户之间物理隔离（独立 Docker 部署），客户内部行级组织隔离
- **开箱即用** —— 认证、权限、文件存储、数据字典、审批流、审计日志、国际化（中英双语）
- **AI-Ready 架构** —— LLM 集成内置于后端；字段建议功能已上线，更多能力规划中

## 技术栈

| 分层 | 技术选型 |
|------|---------|
| 前端 | Next.js 15 · React 19 · Shadcn/ui（v5 canary）· Tailwind CSS · next-intl |
| 后端 | NestJS · Prisma 7 · PostgreSQL 16（pgvector）· Redis 7 |
| AI   | Ollama（本地）· 可选云端服务商 |
| 构建 | Turborepo · pnpm workspaces · TypeScript |
| 部署 | Docker Compose —— 一条命令完成本地部署 |

## 快速开始

**前置依赖：** Node.js、pnpm 9.15+、Docker、PostgreSQL 16（含 pgvector）、Redis 7。

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 设置数据库连接、JWT 密钥等

# 启动 PostgreSQL 和 Redis
docker compose -f docker/docker-compose.yml up -d postgres redis

# 生成 Prisma Client
pnpm db:generate

# 启动所有服务（后端 :3000，前端 :3001）
pnpm dev
```

## 目录结构

```
apps/
  server/          NestJS 后端（端口 3000）
  web/             Next.js 前端（端口 3001）
packages/
  render-engine/   统一的表单/列表渲染引擎
  shared/          公共类型和工具
  ui/              Shadcn/ui 组件库
docker/            Docker Compose 部署配置
```

## 架构

- **模块化单体** —— NestJS Module 通过进程内事件总线解耦通信
- **统一渲染引擎** —— `<RenderProvider>` + `<FormRenderer>` / `<ListRenderer>` 驱动所有表单和列表渲染，禁止手动遍历 LayoutNode 树
- **Schema 分层** —— 平台元数据存在 `public.sys_*`，业务数据存在 `biz` schema，物理表名自动生成为 `{appCode}_{modelCode}`
- **字段类型** —— `STRING`、`TEXT`、`RICHTEXT`、`INTEGER`、`DECIMAL`、`BOOLEAN`、`DATE`、`DATETIME`、`TIME`、`ENUM`、`MULTI_ENUM`、`AUTO_NUMBER`、`REFERENCE`、`MULTI_REFERENCE`、`USER`、`ORGANIZATION`、`FILE`、`IMAGE`
- **归档优先于删除** —— 业务数据使用 `is_archived` 替代 status 字段；有引用时拒绝删除并建议归档

## 开发路线图

- [x] **P0 地基** —— 认证、租户、平台元数据、Docker 部署
- [x] **P1 建模与表单** —— 动态 Schema、渲染引擎、表单/列表设计器
- [ ] **P2 权限与流程** —— 三层 RBAC、审批流编排、软组织隔离
- [ ] **P3 AI 赋能** —— 搭建助手、智能填单、自然语言查询
- [ ] **P4 高级功能** —— 脚本引擎、报表、集成、打印、独立页面
- [ ] **P5 移动与生态** —— Flutter 客户端、插件系统、AI 主动洞察

## 许可证

OpenForge 基于 [MIT License](./LICENSE) 开源发布。

## 联系

首个公开版本发布后，欢迎提 Issue 和 PR。
