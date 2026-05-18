<p align="center">
  <img src="./assets/logo.svg" width="100" height="100" alt="OpenForge logo" />
</p>

<h1 align="center">OpenForge</h1>

<p align="center">
  A low-code platform for domain experts.<br/>
  So those who know the work best can craft the tools they use.
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> · English
</p>

---

## What it is

OpenForge is a low-code platform for domain experts. Design models, forms, and lists in the browser, and the platform generates the database tables and APIs for you. With the built-in AI, a one-sentence description can scaffold a working model and form. Everything runs self-hosted, with no dependency on any cloud service.

> **AI-Powered.** AI is a strong enabler layered on top of solid low-code primitives — it accelerates the work that matters, but the platform stands on its own without it. We don't shoehorn an AI button into every screen for the sake of branding.

## What it can do today

- **Visual modeling** — create models and add fields through the UI; the platform generates real PostgreSQL tables
- **Unified render engine** — forms and lists share one layout pipeline with four modes: `preview` / `create` / `edit` / `view`
- **Self-hosted & offline-first** — fonts, icons, and assets are bundled locally; runs behind a firewall with no public internet
- **Multi-tenant** — physical isolation per customer (independent Docker deployment); row-level organization isolation within a customer
- **Approval workflow** — visual node-graph editor, multi-stage approvals, transfer/return/withdraw, real-time inbox over WebSocket
- **Batteries included** — authentication, RBAC, file storage, data dictionary, audit log, and i18n (zh-CN / en)
- **AI-Powered** — field suggestions in the model designer today; natural-language schema/form/workflow generation on the way. AI is a powerful accelerator, not a forced fixture on every page

## Roadmap

- [x] **P0 Foundation** — authentication, tenants, platform metadata, Docker deployment
- [x] **P1 Modeling & Forms** — dynamic schemas, unified render engine, visual designer
- [x] **P2 Permissions & Workflow** — three-layer RBAC, org switcher, distributed data scope, approval workflow engine with WebSocket notifications
- [ ] **P3 AI Capabilities** — design assistant, natural-language to schema/form/workflow, smart form fill
- [ ] **P4 Advanced** — scripting engine, reports, integrations, print templates, standalone pages
- [ ] **P5 Mobile & Ecosystem** — Flutter client, plugin system

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Next.js 15 · React 19 · Shadcn/ui · Tailwind CSS · next-intl |
| Backend    | NestJS · Prisma 7 · PostgreSQL 18 (pgvector) · Redis 8 |
| AI         | Ollama (local) · optional cloud providers |
| Build      | Turborepo · pnpm workspaces · TypeScript |
| Deployment | Docker Compose |

## Quick Start

Prerequisites: Node.js, pnpm 9.15+, Docker.

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.dev.yml up -d postgres redis
pnpm db:generate
pnpm dev
```

After startup: backend on `http://localhost:3000`, web on `http://localhost:3001`.

## Project Structure

```
apps/
  server/          NestJS backend
  web/             Next.js frontend
packages/
  render-engine/   Form/list render engine
  shared/          Common types and utilities
  ui/              Component library
docker/            Docker Compose deployment config
```

## License

[MIT License](./LICENSE)

## Contributing

This is early-stage work. Issues and pull requests are welcome.
