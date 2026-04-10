# OpenForge

> Self-hosted, offline-capable low-code platform for building internal tools, ERP modules, and line-of-business applications.

[简体中文](./README.zh-CN.md) | English

---

## What is OpenForge?

**OpenForge** (开匠) is a self-hosted low-code platform that lets teams design data models, forms, lists, and workflows visually — and run them as production applications. Unlike hosted low-code tools, OpenForge is built for enterprises that require on-premise deployment, data sovereignty, and zero dependency on the public internet.

LLM integration is baked into the backend architecture, with local Ollama and cloud providers both supported. Field suggestion for model design works today; form auto-generation, natural language query, and proactive insights are on the roadmap.

## Highlights

- **Self-hosted & offline-first** — fonts, icons, and assets are bundled locally; works behind a firewall with no public internet
- **Dynamic schema** — create models and add fields through the UI; the platform generates real PostgreSQL tables with proper DDL
- **Unified render engine** — forms and lists share one layout pipeline with four modes: `preview`, `create`, `edit`, `view`
- **Multi-tenant** — physical isolation per customer (independent Docker deployment); row-level organization isolation within a customer
- **Batteries included** — authentication, RBAC, file storage, data dictionary, approval flows, audit log, and i18n (zh-CN / en)
- **AI-ready architecture** — LLM integration built into the backend; field suggestion ships today, more capabilities planned

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js 15 · React 19 · Shadcn/ui (v5 canary) · Tailwind CSS · next-intl |
| Backend    | NestJS · Prisma 7 · PostgreSQL 16 (pgvector) · Redis 7 |
| AI         | Ollama (local) · optional cloud providers |
| Build      | Turborepo · pnpm workspaces · TypeScript |
| Deployment | Docker Compose — one-command on-premise install |

## Quick Start

**Prerequisites:** Node.js, pnpm 9.15+, Docker, PostgreSQL 16 (with pgvector), Redis 7.

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env to set database URL, JWT secrets, etc.

# Start PostgreSQL and Redis
docker compose -f docker/docker-compose.yml up -d postgres redis

# Generate Prisma client
pnpm db:generate

# Start all services (backend on :3000, web on :3001)
pnpm dev
```

## Project Structure

```
apps/
  server/          NestJS backend (port 3000)
  web/             Next.js frontend (port 3001)
packages/
  render-engine/   Shared form/list rendering pipeline
  shared/          Common types and utilities
  ui/              Shadcn/ui component library
docker/            Docker Compose deployment config
```

## Architecture

- **Modular monolith** — NestJS modules communicate through an in-process event bus
- **Unified render engine** — `<RenderProvider>` + `<FormRenderer>` / `<ListRenderer>` drive all form and list rendering; no manual LayoutNode traversal
- **Schema split** — platform metadata lives in `public.sys_*`; business data lives in the `biz` schema with auto-generated physical tables named `{appCode}_{modelCode}`
- **Field types** — `STRING`, `TEXT`, `RICHTEXT`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `DATE`, `DATETIME`, `TIME`, `ENUM`, `MULTI_ENUM`, `AUTO_NUMBER`, `REFERENCE`, `MULTI_REFERENCE`, `USER`, `ORGANIZATION`, `FILE`, `IMAGE`
- **Archive over delete** — business records use `is_archived` rather than status flags; deletion is blocked when references exist

## Roadmap

- [x] **P0 Foundation** — authentication, tenants, platform metadata, Docker deployment
- [x] **P1 Modeling & Forms** — dynamic schemas, render engine, form/list designer
- [ ] **P2 Permissions & Flows** — three-layer RBAC, approval workflow, soft org isolation
- [ ] **P3 AI Capabilities** — design assistant, smart form fill, natural language query
- [ ] **P4 Advanced** — scripting engine, reports, integrations, print, standalone pages
- [ ] **P5 Mobile & Ecosystem** — Flutter client, plugin system, proactive AI insights

## License

OpenForge is released under the [MIT License](./LICENSE).

## Contact

Issues and pull requests are welcome once the first public release is tagged.
