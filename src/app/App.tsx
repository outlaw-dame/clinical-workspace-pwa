import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { AppSymbol, type SymbolName } from "../design/icons";
import { runCryptoSmokeTest } from "../local/crypto/envelope";
import { runLocalStorageSmokeTest } from "../local/db/client";
import { assertOpfsAvailable } from "../local/opfs/vault";
import { detectCapabilities, describeCapability, type AppCapabilities } from "../platform/capabilities";
import { createAppLock } from "../security/appLock";

type WorkspaceTab = "today" | "chat" | "notes" | "calendar" | "documents";

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

const navItems: NavItem[] = [
  { id: "today", label: "Today", icon: "today" },
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
  }
];

export function App() {
  const capabilities = detectCapabilities();
  const appLock = createAppLock();
  const [activeTab, setActiveTab] = createSignal<WorkspaceTab>("today");
  const [diagnostics, setDiagnostics] = createSignal<Diagnostic[]>(initialDiagnostics);

  const activeNavItem = createMemo(() => navItems.find((item) => item.id === activeTab()) ?? navItems[0]);

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
      fallback={<SecureLockScreen capabilities={capabilities} onUnlock={appLock.unlock} />}
    >
      <div class="app-shell">
        <Sidebar activeTab={activeTab()} onSelect={setActiveTab} />

        <main class="workspace" aria-label={`${activeNavItem().label} workspace`}>
          <header class="large-title-header">
            <div>
              <p class="eyebrow">Clinical Workspace</p>
              <h1>{activeNavItem().label}</h1>
            </div>
            <button class="icon-button" type="button" onClick={appLock.lock} aria-label="Lock workspace">
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

function SecureLockScreen(props: { capabilities: AppCapabilities; onUnlock: () => void }) {
  return (
    <main class="lock-screen">
      <section class="lock-card" aria-labelledby="lock-title">
        <div class="lock-icon">
          <AppSymbol name="shield" size={34} />
        </div>
        <p class="eyebrow">Private local workspace</p>
        <h1 id="lock-title">Unlock your clinical workspace</h1>
        <p class="muted">
          This foundation keeps the app shell local-first and locked by default. Passkeys/WebAuthn are detected now and become the next authentication layer.
        </p>

        <div class="lock-status-grid" aria-label="Device security capabilities">
          <StatusPill label="WebAuthn" value={describeCapability(props.capabilities.webAuthn)} />
          <StatusPill label="Web Crypto" value={describeCapability(props.capabilities.webCrypto)} />
          <StatusPill label="OPFS" value={describeCapability(props.capabilities.opfs)} />
        </div>

        <button class="primary-button" type="button" onClick={props.onUnlock}>
          <AppSymbol name="unlock" />
          Unlock foundation
        </button>
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
  switch (props.activeTab) {
    case "today":
      return <TodayView capabilities={props.capabilities} diagnostics={props.diagnostics} />;
    case "chat":
      return <PlaceholderView icon="chat" title="Secure chat" body="Local optimistic messaging, encrypted attachments, and sync outbox behavior come after the foundation is stable." />;
    case "notes":
      return <PlaceholderView icon="notes" title="Notebook" body="Notes will use encrypted records first, then Yjs-backed rich note bodies only where collaboration is needed." />;
    case "calendar":
      return <PlaceholderView icon="calendar" title="Calendar" body="Appointments, reminders, availability, and follow-ups will stay local-first with push and ICS integrations as progressive enhancements." />;
    case "documents":
      return <PlaceholderView icon="documents" title="Document vault" body="Documents belong in encrypted OPFS blobs locally, with encrypted remote object sync later." />;
  }
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
  const icon = () => {
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

async function runDiagnostics(
  capabilities: AppCapabilities,
  setDiagnostics: (value: Diagnostic[]) => void
): Promise<void> {
  const results = await Promise.allSettled([
    capabilities.webCrypto ? runCryptoSmokeTest() : Promise.resolve("unsupported"),
    capabilities.opfs ? assertOpfsAvailable().then(() => true) : Promise.resolve("unsupported"),
    runLocalStorageSmokeTest()
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
