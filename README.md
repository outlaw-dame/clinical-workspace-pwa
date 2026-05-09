# Secure Local-First Clinical Workspace PWA

A minimalist, Apple-like, local-first Progressive Web App foundation for a secure clinical workspace. The product direction is a private workspace that combines secure chat, notes, calendar, tasks, and encrypted document storage for mental health professional workflows.

This repository started as an architecture specification and now includes an application scaffold with local security, encrypted notes, and local hybrid search foundations.

## Foundation goals

- **Native-feeling PWA:** installable shell, safe-area aware layout, iPhone bottom tabs, larger-screen sidebar, reduced-motion support.
- **Apple-like default interface:** system typography, calm grouped cards, large titles, subtle translucency, minimal dependency footprint.
- **Local-first data boundary:** PGlite local database foundation with audit, sync-outbox, encrypted notes, and local search tables.
- **Encrypted document boundary:** OPFS vault helpers that only accept encrypted bytes.
- **Security-first posture:** local app lock, passkey unlock ceremony, Web Crypto smoke test, no PHI-bearing service-worker API caching, no analytics/session replay.
- **Progressive platform behavior:** feature detection for WebAuthn, Web Crypto, OPFS, Web Push, Share API, file picker, install state, pointer type, and reduced motion.

## Current stack

- Vite
- SolidJS
- TypeScript
- PGlite with pgvector extension wiring
- Vite PWA + Workbox
- Web Crypto API
- Origin Private File System
- Custom semantic SVG icon wrapper
- Custom CSS design tokens and primitives
- Vitest for focused unit tests

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs install, typecheck, lint, tests, and production build on pull requests and pushes to `master`.

New behavior should include sensible tests where practical. Focused unit tests should cover:

- pure ranking and sanitation;
- queueing and retry logic;
- crypto adapters;
- policy helpers.

Browser/PWA surfaces can be covered incrementally as the test harness matures.

## Important security rules

The service worker is intentionally conservative:

- app shell assets may be cached;
- static image/font/manifest assets may be cached;
- `/api/*`, `/app/share-target`, and `/decrypted/*` are `NetworkOnly`;
- decrypted user data must never be exposed by URL;
- PHI-bearing API responses must not be cached by the service worker.

Local search follows the same privacy boundary:

- decrypted note text is not persisted in search tables;
- local search chunks store derived metadata, source timestamps, schema/model metadata, and vectors;
- query text is not written to audit metadata;
- previews are generated from decrypted in-memory notes only after unlock.

Local semantic search uses an explicit embedding-provider boundary:

- providers must declare their model ID, dimensions, and local-only privacy boundary;
- embedding generation supports cancellation and dimension validation;
- indexed chunks store the provider model ID so future model changes can trigger safe reindexing;
- the deterministic token-hash provider is a local fallback and test scaffold, not the final clinical semantic model.

The current passkey flow proves a local browser authenticator ceremony and gates the local workspace. Production sync/session trust still requires server-issued WebAuthn challenges and server-side signature verification.

## Implemented surfaces

- Secure lock screen
- Passkey setup/unlock foundation
- Adaptive app shell
- Today view
- Encrypted secure notes
- Local hybrid search over secure notes
- Local embedding-provider boundary with deterministic fallback provider
- Privacy-safe audit-event writes with serialized hash-chain updates
- Background/batched search-index repair
- Placeholder surfaces for Chat, Calendar, and Documents
- Local-first diagnostics for Web Crypto, OPFS, PGlite, and local search schema initialization
- Platform capability dashboard

## Next implementation phase

1. Add an injectable search repository layer and integration-style tests around local schema/indexing.
2. Replace the deterministic fallback embedding provider with a real local provider behind worker, cancellation, model-version, and reindex boundaries.
3. Add chat message model, local optimistic send, and sync outbox operations with exponential backoff and idempotency.
4. Add document import flow that encrypts before writing to OPFS.
5. Add task and calendar records that fit the Today/Chat/Notes/Calendar surfaces rather than becoming a separate project-management module.
6. Expand audit coverage around lock/unlock, document access, local writes, and sync attempts without storing PHI in logs.

## Compliance note

This scaffold is not a complete HIPAA-compliant product. It establishes the technical direction needed for a HIPAA-oriented product: local-first storage, encryption boundaries, conservative caching, audit-table foundation, privacy-safe local search, and no PHI analytics/logging assumptions. Actual HIPAA readiness also requires operational controls, vendor BAAs, risk analysis, incident response, access reviews, retention policies, and evidence collection.
