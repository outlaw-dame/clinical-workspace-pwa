# Security and privacy boundaries

_Last updated: 2026-06-08_

These boundaries are non-negotiable for this repository. Future work should improve them, not bypass them.

## Local-first private-data boundary

- Decrypted user content must stay inside the unlocked local runtime.
- Decrypted note text must not be persisted into search tables.
- Search previews should be derived from decrypted in-memory content after unlock, not from stored search rows.
- Query text must not be written into audit metadata.
- Direct PGlite search SQL should stay behind the local search repository boundary.

## Service worker boundary

The service worker must remain conservative:

- App shell assets may be cached.
- Static image/font/manifest assets may be cached.
- API routes, share-target routes, and decrypted-data routes must be network-only or otherwise explicitly protected from persistent caching.
- Decrypted user data must not be exposed by URL.
- Sensitive API responses must not be cached by the service worker.

## Encryption and storage boundary

- OPFS vault helpers should only accept encrypted bytes.
- Any future document import flow must encrypt before writing to OPFS.
- Any future preview/extraction pipeline must avoid leaving decrypted bytes in durable browser storage.
- Error messages and logs must not echo decrypted content, document bytes, raw search queries, tokens, or secrets.

## Lock/session boundary

- The current passkey flow is a local browser authenticator ceremony and app gate.
- Production sync/session trust still requires server-issued WebAuthn challenges and server-side signature verification.
- Lock/unlock, failed unlock, sensitive local writes, document access, and sync attempts should be covered by privacy-safe audit events as the surfaces are implemented.

## Embedding runtime boundary

- Local embedding providers must declare model ID, dimensions, and local-only privacy boundary.
- Embedding generation must support cancellation and dimension validation.
- Indexed chunks must store provider model ID so model changes can trigger safe reindexing.
- Deterministic token-hash embeddings are a fallback/test scaffold, not the final semantic model.
- Real model runtime work must keep manifest validation, runtime capability checks, worker request/response contracts, verified artifact loading, and privacy-safe provider errors.

## Artifact integrity boundary

- Runtime-critical model graph, model data, tokenizer JSON, and tokenizer model artifacts must be pinned by SHA-256 integrity metadata.
- Unpinned artifacts must be limited to non-critical metadata roles only.
- Artifact caches must re-check hashes before use and fail closed on mismatches.
- Stale or failed verification state must not silently become trusted state.
- Download/cache retry behavior must preserve cancellation and avoid memoizing caller-scoped abort signals.

## Audit/log boundary

- Audit rows should record action type, timestamps, safe metadata, and hash-chain continuity.
- Audit metadata must not include decrypted content, raw search query text, tokens, keys, or full file contents.
- Logs should be useful for troubleshooting without becoming a sensitive-data store.

## Claim boundary

This repo must not be described as a complete compliance-ready product. It is a technical foundation. Production readiness also requires operational controls, deployment policies, vendor agreements, risk analysis, incident response, access reviews, retention policies, and evidence collection.
