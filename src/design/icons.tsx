import type { JSX } from "solid-js";

export type SymbolName =
  | "today"
  | "chat"
  | "notes"
  | "calendar"
  | "documents"
  | "lock"
  | "unlock"
  | "shield"
  | "check"
  | "warning"
  | "database"
  | "cloudOff";

const paths: Record<SymbolName, JSX.Element> = {
  today: (
    <>
      <path d="M7 3.5v3" />
      <path d="M17 3.5v3" />
      <path d="M4.75 8.5h14.5" />
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 12h3" />
      <path d="M8 16h6" />
    </>
  ),
  chat: (
    <>
      <path d="M5 7.75A4.75 4.75 0 0 1 9.75 3h4.5A4.75 4.75 0 0 1 19 7.75v3.5A4.75 4.75 0 0 1 14.25 16H11l-4.5 4v-4.75A4.75 4.75 0 0 1 5 11.25z" />
      <path d="M9 8.5h6" />
      <path d="M9 11.5h4" />
    </>
  ),
  notes: (
    <>
      <path d="M7 3.5h7.5L19 8v12.5H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
      <path d="M14 3.5V8h5" />
      <path d="M8.5 12h7" />
      <path d="M8.5 15.5H14" />
    </>
  ),
  calendar: (
    <>
      <path d="M7 3.5v3" />
      <path d="M17 3.5v3" />
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 9h16" />
      <path d="M8 13h2" />
      <path d="M14 13h2" />
      <path d="M8 16h2" />
    </>
  ),
  documents: (
    <>
      <path d="M8 3.5h7L19 7.5v11A2.5 2.5 0 0 1 16.5 21H8a2.5 2.5 0 0 1-2.5-2.5v-12A3 3 0 0 1 8 3.5Z" />
      <path d="M14.5 3.5V8H19" />
      <path d="M9 12h6" />
      <path d="M9 15h6" />
      <path d="M9 18h3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8 10V7.75a4 4 0 0 1 8 0V10" />
      <path d="M12 14.5v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8 10V7.75A4 4 0 0 1 15.45 5.7" />
      <path d="M12 14.5v2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.4c0 4.35-2.85 7.7-7 9.1-4.15-1.4-7-4.75-7-9.1V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.25 2.2 2.2 4.8-5" />
    </>
  ),
  warning: (
    <>
      <path d="m12 4 9 16H3z" />
      <path d="M12 9v5" />
      <path d="M12 17.5v.1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.65 3.13 3 7 3s7-1.35 7-3V6" />
      <path d="M5 12v6c0 1.65 3.13 3 7 3s7-1.35 7-3v-6" />
    </>
  ),
  cloudOff: (
    <>
      <path d="m4 4 16 16" />
      <path d="M16.5 16H8.75A4.75 4.75 0 0 1 8 6.56 5.8 5.8 0 0 1 17.8 9.4 3.6 3.6 0 0 1 20 15.4" />
    </>
  )
};

export function AppSymbol(props: { name: SymbolName; size?: number; title?: string }): JSX.Element {
  return (
    <svg
      aria-hidden={props.title ? undefined : "true"}
      aria-label={props.title}
      class="app-symbol"
      fill="none"
      height={props.size ?? 24}
      role={props.title ? "img" : undefined}
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.75"
      viewBox="0 0 24 24"
      width={props.size ?? 24}
    >
      {paths[props.name]}
    </svg>
  );
}
