# OpenForge 开匠

> 为领域专家而生的低代码平台 —— 不是为程序员。
> 让真正懂业务的人，亲手打造自己需要的系统。

简体中文 | [English](./README.md)

---

## OpenForge 为何存在

一位在车间摸爬二十年的工艺工程师。一位看过十万病例的临床医生。一位能靠手感读土壤的家庭农场主。一位能靠声音辨认每台机器状态的车间主任。这些人拥有足以重塑他们所在行业的经验和方法论 —— 但他们不写代码，请不起定制开发团队，也不愿意把客户的敏感数据托付给别人的云。

**OpenForge 就是为他们而生。**

我们的目标不是"又一个低代码工具"，而是**拆掉一个领域专家和他所需要的数字工具之间的每一道门** —— 技术的门、法律的门、商业的门。

## 它是怎么做到的

三层结构，彼此依赖、相互强化：

**1. 低代码底座** —— 可视化的模型、表单、列表设计器，底层落到真实的 PostgreSQL 物理表。你描述数据，OpenForge 生成 Schema、表单、列表视图、CRUD 接口，无需一行胶水代码。

**2. AI 作为桥梁** —— 低代码独自无法跨越的鸿沟是"**如何用数据模型思考**"。AI 补上这一步。用自然语言描述一个场景 —— *"我要每月巡检二十台设备，记录异常，出故障通知维修班"* —— OpenForge 帮你生成模型、表单、流程、权限。字段建议已经上线，自然语言转 Schema、转表单、转流程正在路上。

**3. 自托管 + MIT 许可** —— 无供应商锁定、无"我能不能商用"的法律顾虑、无云厂商抓着你的数据不放。任何能跑 Docker 的地方都能部署。随便 Fork、修改、换皮、销售 —— 许可证已经说了"yes"，无需征询任何人。

## 谁应该使用它

- **传统行业的老师傅** —— 工艺工程师、车间主任、诊所医生、家庭农场主、质量与安全专员
- **想逃离中央 IT 排期地狱的业务团队** —— HR 业务伙伴、采购主管、财务分析师、合规经理 —— 需要本季度就上线的解决方案，等不到明年
- **服务商与独立咨询顾问** —— 基于一个你完全掌控的开放底座，为客户构建定制方案
- **公共部门与基层组织** —— 任何需要数据主权、不能依赖公有云的团队

## 当前状态

- [x] **P0 地基** —— 认证、租户、平台元数据、Docker 部署
- [x] **P1 建模与表单** —— 动态 Schema、统一渲染引擎、可视化表单和列表设计器
- [ ] **P2 权限与流程** —— 三层 RBAC、审批流编排、软组织隔离 *（进行中）*
- [ ] **P3 AI 赋能** —— 搭建助手、自然语言转 Schema/表单/流程、智能填单、主动洞察
- [ ] **P4 高级功能** —— 脚本引擎、报表、集成、打印模板、独立页面
- [ ] **P5 移动与生态** —— Flutter 客户端、插件系统、AI 主动洞察

AI 能力是**贯穿每一个阶段持续交付**的，不是留到最后才做。现在：模型设计中的字段建议。下一步：自然语言生成 Schema。

## 当前已落地的特性

- **自托管 & 离线优先** —— 字体、图标、资源全部本地打包，在防火墙后无公网也能运行
- **动态建模** —— 在界面上创建模型、添加字段，平台自动生成真实的 PostgreSQL 物理表
- **统一渲染引擎** —— 表单与列表共享同一套布局管线，支持 `preview` / `create` / `edit` / `view` 四种模式
- **多租户隔离** —— 客户之间物理隔离（独立 Docker 部署），客户内部行级组织隔离
- **开箱即用** —— 认证、权限、文件存储、数据字典、审批流、审计日志、国际化（中英双语）
- **AI 集成内置** —— LLM 支持已布线到后端架构；自由选择本地 Ollama 或云端服务商

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

## 架构原则

- **模块化单体** —— NestJS Module 通过进程内事件总线解耦通信；绝大多数部署场景下，无需承担微服务的复杂度
- **统一渲染引擎** —— `<RenderProvider>` + `<FormRenderer>` / `<ListRenderer>` 驱动所有表单和列表渲染，禁止手动遍历布局树
- **Schema 分层** —— 平台元数据存在 `public.sys_*`，业务数据存在 `biz` schema，物理表名自动生成为 `{appCode}_{modelCode}`
- **字段类型** —— `STRING`、`TEXT`、`RICHTEXT`、`INTEGER`、`DECIMAL`、`BOOLEAN`、`DATE`、`DATETIME`、`TIME`、`ENUM`、`MULTI_ENUM`、`AUTO_NUMBER`、`REFERENCE`、`MULTI_REFERENCE`、`USER`、`ORGANIZATION`、`FILE`、`IMAGE`
- **归档优先于删除** —— 业务数据使用 `is_archived` 替代 status 字段；有引用时拒绝删除并建议归档

## 许可证

OpenForge 基于 [MIT License](./LICENSE) 开源发布。随便用、随便改、随便部署、随便 Fork、随便卖 —— 无需询问。许可证是我们核心信念的法律表达：**领域专家与他所需要的工具之间的每一道门，都应该被拆掉。**

## 参与贡献

欢迎提交 Issue 和 Pull Request。项目尚处早期阶段，具体的贡献指南会随着社区的成长而逐步完善。
