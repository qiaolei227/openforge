<p align="center">
  <img src="./assets/logo.svg" width="100" height="100" alt="OpenForge 开匠" />
</p>

<h1 align="center">OpenForge 开匠</h1>

<p align="center">
  一个面向领域专家的低代码平台。<br/>
  让懂业务的人，亲手打磨出自己顺手的工具。
</p>

<p align="center">
  简体中文 · <a href="./README.md">English</a>
</p>

---

## 这是什么

OpenForge 是一个面向领域专家的低代码平台。在界面上画模型、画表单、画列表，平台自动生成数据库表和接口。配合内置的 AI，用一句话描述场景就能生成基础的模型和表单。所有功能都可以自托管运行，不依赖任何云服务。

> **AI 赋能（AI-Powered）。** AI 是低代码核心能力之上的强力增强 —— 它能加速真正重要的工作，但平台没有 AI 也能完整运转。我们不为了"AI 形象"给每个页面都强行塞一个 AI 按钮。

## 当前能做什么

- **可视化建模** —— 在界面上创建模型、添加字段，平台自动生成真实的 PostgreSQL 物理表
- **统一渲染引擎** —— 表单与列表共享同一套布局管线，支持 `preview` / `create` / `edit` / `view` 四种模式
- **自托管 & 离线优先** —— 字体、图标、资源全部本地打包，在无公网环境也能运行
- **多租户隔离** —— 客户之间物理隔离（独立 Docker 部署），客户内部行级组织隔离
- **审批流引擎** —— 可视化节点编辑器、多级审批、转交/退回/撤销、基于 WebSocket 的实时收件箱
- **开箱即用** —— 认证、权限、文件存储、数据字典、审计日志、国际化（中英双语）
- **AI 赋能（AI-Powered）** —— 模型设计中已支持字段建议；自然语言生成 Schema/表单/流程正在路上。AI 是强力加速器，但不是每个页面都必须挂载的标配

## 路线图

- [x] **P0 地基** —— 认证、租户、平台元数据、Docker 部署
- [x] **P1 建模与表单** —— 动态 Schema、统一渲染引擎、可视化设计器
- [x] **P2 权限与流程** —— 三层 RBAC、组织切换器、分配型数据、审批流引擎 + WebSocket 实时通知
- [ ] **P3 AI 赋能** —— 搭建助手、自然语言转 Schema/表单/流程、智能填单
- [ ] **P4 高级功能** —— 脚本引擎、报表、集成、打印模板、独立页面
- [ ] **P5 移动与生态** —— Flutter 客户端、插件系统

## 技术栈

| 分层 | 技术选型 |
|------|---------|
| 前端 | Next.js 15 · React 19 · Shadcn/ui · Tailwind CSS · next-intl |
| 后端 | NestJS · Prisma 7 · PostgreSQL 18（pgvector）· Redis 8 |
| AI   | Ollama（本地）· 可选云端服务商 |
| 构建 | Turborepo · pnpm workspaces · TypeScript |
| 部署 | Docker Compose |

## 快速开始

前置依赖：Node.js、pnpm 9.15+、Docker。

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.dev.yml up -d postgres redis
pnpm db:generate
pnpm dev
```

启动后：后端在 `http://localhost:3000`，前端在 `http://localhost:3001`。

## 目录结构

```
apps/
  server/          NestJS 后端
  web/             Next.js 前端
packages/
  render-engine/   表单/列表渲染引擎
  shared/          公共类型和工具
  ui/              组件库
docker/            Docker Compose 部署配置
```

## 许可证

[MIT License](./LICENSE)

## 参与贡献

项目尚处早期阶段，欢迎提交 Issue 和 Pull Request。
