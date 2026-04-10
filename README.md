# OpenForge

> A low-code platform for domain experts — not for developers.
> Built so the people who know the work can build the software that runs it.

[简体中文](./README.zh-CN.md) | English

---

## Why OpenForge exists

A process engineer with twenty years on the shop floor. A clinic doctor who has seen a hundred thousand patients. A family farm operator who reads the soil by feel. A workshop supervisor who knows every machine by sound. These people have the expertise to build management software that could reshape their industry — but they don't write code, they can't afford a custom dev team, and they are not willing to put their data on someone else's cloud.

**OpenForge is for them.**

The goal is not to be yet another low-code tool. The goal is to remove every single barrier — technical, legal, and commercial — between a domain expert and the digital tool that captures their hard-won know-how.

## How it works

Three layers, each reinforcing the others:

**1. Low-code foundation** — A visual model, form, and list designer backed by real PostgreSQL tables. You describe the data, OpenForge generates the schema, the forms, the list views, and the CRUD APIs. No glue code required.

**2. AI as the bridge** — The gap that low-code alone cannot cross is *thinking in data models*. AI closes it. Describe a scenario in natural language — *"we inspect twenty machines monthly, record anomalies, and notify maintenance if anything fails"* — and OpenForge generates the models, forms, workflows, and permissions. Field suggestion ships today. Natural-language to schema, form, and workflow are next on the roadmap.

**3. Self-hosted + MIT license** — No vendor lock-in. No "can I use this commercially" doubt. No cloud provider holding your data hostage. Deploy anywhere Docker runs. Fork it, modify it, rebrand it, sell it — the license says yes without asking.

## Who should use it

- **Traditional-industry veterans** — process engineers, workshop supervisors, clinic doctors, family farm operators, quality and safety specialists
- **Business teams escaping central-IT backlog** — HR business partners, procurement leads, FP&A analysts, compliance managers who need solutions this quarter, not next year
- **Service providers and independent consultants** — build custom solutions for clients on an open foundation you fully control
- **Public sector and grassroots organizations** — any team that needs data sovereignty and cannot rely on public cloud

## Status today

- [x] **P0 Foundation** — authentication, tenants, platform metadata, Docker deployment
- [x] **P1 Modeling & Forms** — dynamic schemas, unified render engine, visual form and list designer
- [ ] **P2 Permissions & Workflow** — three-layer RBAC, approval flows, soft organization isolation *(in progress)*
- [ ] **P3 AI Capabilities** — design assistant, natural-language to schema/form/workflow, smart form fill, proactive insights
- [ ] **P4 Advanced** — scripting engine, reports, integrations, print templates, standalone pages
- [ ] **P5 Mobile & Ecosystem** — Flutter client, plugin system, proactive AI insights

AI capabilities are rolling out across every phase, not deferred to the end. Today: field suggestion in model design. Next: natural-language schema generation.

## Features that ship today

- **Self-hosted & offline-first** — fonts, icons, and assets are bundled locally; works behind a firewall with no public internet
- **Dynamic schema** — create models and add fields through the UI; the platform generates real PostgreSQL tables with proper DDL
- **Unified render engine** — forms and lists share one layout pipeline with four modes: `preview`, `create`, `edit`, `view`
- **Multi-tenant** — physical isolation per customer (independent Docker deployment); row-level organization isolation within a customer
- **Batteries included** — authentication, RBAC, file storage, data dictionary, approval flows, audit log, and i18n (zh-CN / en)
- **AI integration built in** — LLM support wired into the backend architecture; bring your own local Ollama or cloud provider

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

## Architecture Principles

- **Modular monolith** — NestJS modules communicate through an in-process event bus; no microservices overhead at the scale most deployments need
- **Unified render engine** — `<RenderProvider>` + `<FormRenderer>` / `<ListRenderer>` drive all form and list rendering; no manual layout tree traversal
- **Schema split** — platform metadata lives in `public.sys_*`; business data lives in the `biz` schema with auto-generated physical tables named `{appCode}_{modelCode}`
- **Field types** — `STRING`, `TEXT`, `RICHTEXT`, `INTEGER`, `DECIMAL`, `BOOLEAN`, `DATE`, `DATETIME`, `TIME`, `ENUM`, `MULTI_ENUM`, `AUTO_NUMBER`, `REFERENCE`, `MULTI_REFERENCE`, `USER`, `ORGANIZATION`, `FILE`, `IMAGE`
- **Archive over delete** — business records use `is_archived` rather than status flags; deletion is blocked when references exist

## License

OpenForge is released under the [MIT License](./LICENSE). Use it, modify it, deploy it, fork it, sell it — without asking permission. The license is the legal expression of our core belief: **the barriers between a domain expert and the tool that captures their expertise should all come down.**

## Contributing

Issues and pull requests are welcome. This is early-stage work, and the contribution guidelines will evolve as the community grows.
