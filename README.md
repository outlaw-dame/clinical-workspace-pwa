# Secure Local-First Clinical Workspace PWA

A minimalist, Apple-like, local-first Progressive Web App foundation for a secure clinical workspace. The product direction is a private workspace that combines secure chat, notes, calendar, tasks, and encrypted document storage for mental health professional workflows.

This repository started as an architecture specification and now includes the first application scaffold.

## Foundation goals

- **Native-feeling PWA:** installable shell, safe-area aware layout, iPhone bottom tabs, larger-screen sidebar, reduced-motion support.
- **Apple-like default interface:** system typography, calm grouped cards, large titles, subtle translucency, minimal dependency footprint.
- **Local-first data boundary:** PGlite local database foundation with audit and sync-outbox tables.
- **Encrypted document boundary:** OPFS vault helpers that only accept encrypted bytes.
- **Security-first posture:** local app lock, Web Crypto smoke test, no PHI-bearing service-worker API caching, no analytics/session replay.
- **Progressive platform behavior:** feature detection for WebAuthn, Web Crypto, OPFS, Web Push, Share API, file picker, install state, pointer type, and reduced motion.

## Current stack

- Vite
- SolidJS
- TypeScript
- PGlite
- Vite PWA + Workbox
- Web Crypto API
- Origin Private File System
- Custom semantic SVG icon wrapper
- Custom CSS design tokens and primitives

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

CI runs typecheck, lint, and production build on pull requests and pushes to `master`.

## Important security rules

The service worker is intentionally conservative:

- app shell assets may be cached;
- static image/font/manifest assets may be cached;
- `/api/*`, `/app/share-target`, and `/decrypted/*` are `NetworkOnly`;
- decrypted user data must never be exposed by URL;
- PHI-bearing API responses must not be cached by the service worker.

The current app lock is a local foundation lock, not final authentication. Passkeys/WebAuthn should become the real auth unlock path in the next security phase.

## First implemented surfaces

- Secure lock screen
- Adaptive app shell
- Today view
- Placeholder surfaces for Chat, Notes, Calendar, and Documents
- Local-first diagnostics for Web Crypto, OPFS, and PGlite
- Platform capability dashboard

## Next implementation phase

1. Replace foundation unlock with WebAuthn/passkey registration and authentication.
2. Move encryption work into a dedicated worker boundary.
3. Add encrypted local note records with explicit migrations.
4. Add chat message model, local optimistic send, and sync outbox operations.
5. Add document import flow that encrypts before writing to OPFS.
6. Add audit-event creation around lock/unlock, document access, and local writes.

## Compliance note

This scaffold is not a complete HIPAA-compliant product. It establishes the technical direction needed for a HIPAA-oriented product: local-first storage, encryption boundaries, conservative caching, audit-table foundation, and no PHI analytics/logging assumptions. Actual HIPAA readiness also requires operational controls, vendor BAAs, risk analysis, incident response, access reviews, retention policies, and evidence collection.
