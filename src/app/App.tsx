import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AppSymbol, type SymbolName } from "../design/icons";
import { runCryptoSmokeTest } from "../local/crypto/envelope";
import { clearCryptoSession, initializeCryptoSession } from "../local/crypto/workerClient";
import { runLocalStorageSmokeTest } from "../local/db/client";
import { assertOpfsAvailable } from "../local/opfs/vault";
import { runLocalSearchSmokeTest } from "../local/search/localSearchIndex";
import { detectCapabilities, describeCapability, type AppCapabilities } from "../platform/capabilities";
import { createAppLock } from "../security/appLock";
import { authenticateLocalPasskey, hasLocalPasskey, registerLocalPasskey } from "../security/passkeys";
import { NotesWorkspace } from "./NotesWorkspace";

type WorkspaceTab = "today" | "chat" | "notes" | "calendar" | "documents";
type UnlockMode = "passkey" | "foundation";

type NavItem = {
  id: WorkspaceTab;
  label: string;
  icon: SymbolName;
};

type DiagnosticState = "pending" | "passed" | "failed" | "unsupported";

type Diagnostic = {
  id: string;
  label: string;
  detail: string;
  state: DiagnosticState;
};

const defaultNavItem: NavItem = { id: "today", label: "Today", icon: "today" };

const navItems: NavItem[] = [
  defaultNavItem,
  { id: "chat", label: "Chat", icon: "chat" },
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "documents", label: "Documents", icon: "documents" }
];

const initialDiagnostics: Diagnostic[] = [
  {
    id: "crypto",
    label: "Web Crypto",
    detail: "AES-GCM encryption/decryption smoke test",
    state: "pending"
  },
  {
    id: "opfs",
    label: "Encrypted vault",
    detail: "Origin Private File System availability check",
    state: "pending"
  },
  {
    id: "pglite",
    label: "Local database",
    detail: "PGlite IndexedDB-backed record smoke test",
    state: "pending"
  },
  {
    id: "local-search",
    label: "Local hybrid search",
    detail: "PGlite pgvector schema and semantic index smoke test",
    state: "pending"
  }
];

export function App() {
  const capabilities = detectCapabilities();
  const handleLockCleanup = () => {
    void clearCryptoSession().catch((error: unknown) => {
      console.warn("Unable to clear crypto session", error);
    });
  };
  const appLock = createAppLock({ onLock: handleLockCleanup });
  const [activeTab, setActiveTab] = createSignal<WorkspaceTab>("today");
  const [diagnostics, setDiagnostics] = createSignal<Diagnostic[]>(initialDiagnostics);

  const activeNavItem = createMemo(() =>
    navItems.find((item) => item.id === activeTab()) ?? defaultNavItem
  );

  const handleUnlock = async (mode: UnlockMode): Promise<void> => {
    if (mode === "passkey") {
      if (await hasLocalPasskey()) {
        await authenticateLocalPasskey();
      } else {
        await registerLocalPasskey();
      }
    } else if (await hasLocalPasskey()) {
      throw new Error("Passkey authentication is required for this workspace");
    }

    await initializeCryptoSession();
    appLock.unlock();
  };

  onMount(() => {
    const activityEvents = ["pointerdown", "keydown", "focus"] as const;
    const activityHandler = () => appLock.markActivity();

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, activityHandler, { passive: true });
    }

    void runDiagnostics(capabilities, setDiagnostics);

    onCleanup(() => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, activityHandler);
      }
    });
  });

  return (
    <Show
      when={!appLock.locked()}
      fallback={<SecureLockScreen capabilities={capabilities} onUnlock={handleUnlock} />}
    >
      <div class="app-shell">
        <Sidebar activeTab={activeTab()} onSelect={setActiveTab} />

        <main class="workspace" aria-label={`${activeNavItem().label} workspace`}>
          <header class="large-title-header">
            <div>
              <p class="eyebrow">Clinical Workspace</p>
              <h1>{activeNavItem().label}</h1>
            </div>
            <button
              class="icon-button"
              type="button"
              onClick={appLock.lock}
              aria-label="Lock workspace"
            >
              <AppSymbol name="lock" />
            </button>
          </header>

          <section class="workspace-content">
            <TabContent activeTab={activeTab()} capabilities={capabilities} diagnostics={diagnostics()} />
          </section>
        </main>

        <BottomTabBar activeTab={activeTab()} onSelect={setActiveTab} />
      </div>
    </Show>
  );
}

function SecureLockScreen(props: {
  capabilities: AppCapabilities;
  onUnlock: (mode: UnlockMode) => Promise<void>;
}) {
  const [hasPasskey, setHasPasskey] = createSignal<boolean | undefined>();
  const [busy, setBusy] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | undefined>();

  onMount(() => {
    void hasLocalPasskey()
      .then(setHasPasskey)
      .catch(() => setHasPasskey(false));
  });

  const unlock = async (mode: UnlockMode): Promise<void> => {
    setBusy(true);
    setErrorMessage(undefined);

    try {
      await props.onUnlock(mode);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  };

  const passkeyLabel = () => {
    if (!props.capabilities.webAuthn) return "Passkeys unavailable";
    if (hasPasskey() === undefined) return "Checking passkey";
    return hasPasskey() ? "Unlock with passkey" : "Set up passkey and unlock";
  };

  return (
    <main class="lock-screen">
      <section class="lock-card" aria-labelledby="lock-title">
        <div class="lock-icon">
          <AppSymbol name="shield" size={34} />
        </div>
        <p class="eyebrow">Private local workspace</p>
        <h1 id="lock-title">Unlock your clinical workspace</h1>
        <p class="muted">
          Local records stay encrypted at rest. Passkeys gate the workspace when supported, and the encryption key is managed inside a dedicated browser worker session.
        </p>

        <div class="lock-status-grid" aria-label="Device security capabilities">
          <StatusPill label="WebAuthn" value={describeCapability(props.capabilities.webAuthn)} />
          <StatusPill label="Web Crypto" value={describeCapability(props.capabilities.webCrypto)} />
          <StatusPill label="OPFS" value={describeCapability(props.capabilities.opfs)} />
        </div>

        <Show when={errorMessage()}>
          {(message) => <p class="error-message" role="alert">{message()}</p>}
        </Show>

        <button
          class="primary-button"
          type="button"
          disabled={busy() || !props.capabilities.webAuthn || hasPasskey() === undefined}
          onClick={() => void unlock("passkey")}
        >
          <AppSymbol name="key" />
          {busy() ? "Unlocking..." : passkeyLabel()}
        </button>

        <Show when={hasPasskey() === false}>
          <button
            class="secondary-button"
            type="button"
            disabled={busy() || !props.capabilities.webCrypto}
            onClick={() => void unlock("foundation")}
          >
            <AppSymbol name="unlock" />
            Foundation unlock
          </button>
        </Show>
      </section>
    </main>
  );
}

function Sidebar(props: { activeTab: WorkspaceTab; onSelect: (tab: WorkspaceTab) => void }) {
  return (
    <aside class="sidebar" aria-label="Primary">
      <div class="sidebar-brand">
        <div class="brand-mark"><AppSymbol name="shield" size={22} /></div>
        <div>
          <strong>Workspace</strong>
          <span>Local-first</span>
        </div>
      </div>

      <nav class="nav-list">
        <For each={navItems}>
          {(item) => (
            <button
              classList={{ "nav-item": true, active: props.activeTab === item.id }}
              type="button"
              onClick={() => props.onSelect(item.id)}
            >
              <AppSymbol name={item.icon} />
              <span>{item.label}</span>
            </button>
          )}
        </For>
      </nav>
    </aside>
  );
}

function BottomTabBar(props: { activeTab: WorkspaceTab; onSelect: (tab: WorkspaceTab) => void }) {
  return (
    <nav class="bottom-tab-bar" aria-label="Primary">
      <For each={navItems}>
        {(item) => (
          <button
            classList={{ "bottom-tab": true, active: props.activeTab === item.id }}
            type="button"
            onClick={() => props.onSelect(item.id)}
          >
            <AppSymbol name={item.icon} size={22} />
            <span>{item.label}</span>
          </button>
        )}
      </For>
    </nav>
  );
}

function TabContent(props: {
  activeTab: WorkspaceTab;
  capabilities: AppCapabilities;
  diagnostics: Diagnostic[];
}) {
  return (
    <Switch>
      <Match when={props.activeTab === "today"}>
        <TodayView capabilities={props.capabilities} diagnostics={props.diagnostics} />
      </Match>
      <Match when={props.activeTab === "chat"}>
        <PlaceholderView
          icon="chat"
          title="Secure chat"
          body="Local optimistic messaging, encrypted attachments, and sync outbox behavior come after the foundation is stable."
        />
      </Match>
      <Match when={props.activeTab === "notes"}>
        <NotesWorkspace />
      </Match>
      <Match when={props.activeTab === "calendar"}>
        <PlaceholderView
          icon="calendar"
          title="Calendar"
          body="Appointments, reminders, availability, and follow-ups will stay local-first with push and ICS integrations as progressive enhancements."
        />
      </Match>
      <Match when={props.activeTab === "documents"}>
        <PlaceholderView
          icon="documents"
          title="Document vault"
          body="Documents belong in encrypted OPFS blobs locally, with encrypted remote object sync later."
        />
      </Match>
    </Switch>
  );
}

function TodayView(props: { capabilities: AppCapabilities; diagnostics: Diagnostic[] }) {
  return (
    <div class="today-grid">
      <section class="hero-card">
        <div class="hero-copy">
          <p class="eyebrow">Foundation sprint</p>
          <h2>Minimal, native-feeling, secure by default.</h2>
          <p>
            The first milestone is the installable shell, adaptive Apple-like layout, local database, encrypted vault boundary, and safe service-worker cache policy.
          </p>
        </div>
        <div class="hero-orb"><AppSymbol name="shield" size={40} /></div>
      </section>

      <section class="grouped-card">
        <header class="card-header">
          <h2>Local-first diagnostics</h2>
          <p>These checks verify the browser can support the secure foundation.</p>
        </header>
        <div class="diagnostic-list">
          <For each={props.diagnostics}>{(item) => <DiagnosticRow diagnostic={item} />}</For>
        </div>
      </section>

      <section class="grouped-card">
        <header class="card-header">
          <h2>Platform capabilities</h2>
          <p>Features are enabled by capability detection, not hard-coded device assumptions.</p>
        </header>
        <div class="capability-grid">
          <StatusPill label="Platform" value={props.capabilities.platform} />
          <StatusPill label="Installed" value={props.capabilities.installed ? "Yes" : "No"} />
          <StatusPill label="Web Push" value={describeCapability(props.capabilities.webPush)} />
          <StatusPill label="Share API" value={describeCapability(props.capabilities.shareApi)} />
          <StatusPill label="File picker" value={describeCapability(props.capabilities.filePicker)} />
          <StatusPill label="Reduced motion" value={props.capabilities.reducedMotion ? "On" : "Off"} />
        </div>
      </section>
    </div>
  );
}

function PlaceholderView(props: { icon: SymbolName; title: string; body: string }) {
  return (
    <section class="placeholder-card">
      <div class="placeholder-icon"><AppSymbol name={props.icon} size={32} /></div>
      <h2>{props.title}</h2>
      <p>{props.body}</p>
    </section>
  );
}

function DiagnosticRow(props: { diagnostic: Diagnostic }) {
  const icon = (): SymbolName => {
    switch (props.diagnostic.state) {
      case "passed":
        return "check";
      case "failed":
      case "unsupported":
        return "warning";
      case "pending":
        return "database";
    }
  };

  return (
    <article class="diagnostic-row">
      <div classList={{ "diagnostic-icon": true, [props.diagnostic.state]: true }}>
        <AppSymbol name={icon()} size={22} />
      </div>
      <div>
        <strong>{props.diagnostic.label}</strong>
        <span>{props.diagnostic.detail}</span>
      </div>
      <span classList={{ "diagnostic-state": true, [props.diagnostic.state]: true }}>
        {props.diagnostic.state}
      </span>
    </article>
  );
}

function StatusPill(props: { label: string; value: string }) {
  return (
    <div class="status-pill">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function runOpfsSmokeTest(): boolean {
  assertOpfsAvailable();
  return true;
}

async function runDiagnostics(
  capabilities: AppCapabilities,
  setDiagnostics: (value: Diagnostic[]) => void
): Promise<void> {
  const results = await Promise.allSettled([
    capabilities.webCrypto ? runCryptoSmokeTest() : Promise.resolve("unsupported"),
    capabilities.opfs ? Promise.resolve(runOpfsSmokeTest()) : Promise.resolve("unsupported"),
    runLocalStorageSmokeTest(),
    runLocalSearchSmokeTest()
  ]);

  setDiagnostics(
    initialDiagnostics.map((diagnostic, index) => {
      const result = results[index];

      if (!result || result.status === "rejected") {
        return { ...diagnostic, state: "failed" };
      }

      if (result.value === "unsupported") {
        return { ...diagnostic, state: "unsupported" };
      }

      return { ...diagnostic, state: result.value === true ? "passed" : "failed" };
    })
  );
}
