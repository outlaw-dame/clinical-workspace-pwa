# Secure Local-First Clinical Workspace PWA

This repository contains the detailed specification and architectural recommendations for building a secure, local-first Progressive Web Application (PWA) designed for mental health professional workflows. The goal is to create a clinical workspace that unifies functionalities similar to Apple Notes, Messages, Calendar, Reminders, and Files, with a strong emphasis on local-first data, encryption, offline capabilities, and strict compliance architecture.

## Key Features and Architectural Principles:

*   **Local-First Data:** Prioritizing local reads and writes with background synchronization.
*   **Custom Apple-like Design System:** A thin custom UI system for a native-feeling experience.
*   **Security and Compliance:** HIPAA-grade security architecture, client-side encryption, and robust authentication.
*   **PWA Capabilities:** Installable, offline-capable, and integrated with OS features.
*   **Performance:** Optimized for instant feel with virtualized lists, lazy loading, and worker-based processing.

## Recommended Stack:

*   **App Framework:** Vite + SolidJS + TypeScript
*   **Local Relational Store:** PGlite + Drizzle
*   **Sync Engine:** ElectricSQL-style Postgres sync or Zero
*   **Collaborative Notes:** Yjs or Automerge (for CRDTs)
*   **File/Document Storage:** OPFS + encrypted blob vault
*   **Auth:** Passkeys/WebAuthn
*   **Crypto:** Web Crypto API

## Design System Highlights:

*   **Typography:** Apple system fonts (`-apple-system`, `SF Pro Text`, etc.)
*   **UI Primitives:** Custom-built components like `AppShell`, `NavigationStack`, `MessageBubble`, etc.
*   **Layout Rules:** Platform-adaptive layouts for iPhone, iPad, macOS/desktop PWA, and Android.
*   **Icons:** Iconoir (recommended) or Lucide, wrapped in a semantic symbol system.

## Security Architecture:

*   OWASP ASVS Level 2 baseline (Level 3 for PHI-critical paths).
*   No PHI in logs, analytics, or session replay.
*   Client-side encryption with non-extractable keys.
*   Remote wipe and device/session management.

This project aims to deliver a minimalist yet powerful application suitable for health-adjacent workflows, focusing on an exceptional user experience without compromising security and compliance.
