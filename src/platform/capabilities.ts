export type PlatformKind = "ios" | "ipados" | "android" | "desktop" | "unknown";

export type AppCapabilities = {
  platform: PlatformKind;
  installed: boolean;
  standalone: boolean;
  webPush: boolean;
  serviceWorker: boolean;
  opfs: boolean;
  webAuthn: boolean;
  webCrypto: boolean;
  filePicker: boolean;
  shareApi: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  reducedMotion: boolean;
  coarsePointer: boolean;
};

type NavigatorWithOptionalStorage = Navigator & {
  storage?: {
    getDirectory?: unknown;
  };
};

function detectPlatform(): PlatformKind {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  const hasTouch = navigator.maxTouchPoints > 1;

  if (/iphone|ipod/.test(userAgent)) return "ios";
  if (/ipad/.test(userAgent)) return "ipados";
  if (platform.includes("mac") && hasTouch) return "ipados";
  if (/android/.test(userAgent)) return "android";
  if (/mac|win|linux/.test(platform)) return "desktop";

  return "unknown";
}

export function detectCapabilities(): AppCapabilities {
  const standaloneQuery = window.matchMedia("(display-mode: standalone)").matches;
  const legacyStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const storage = (navigator as NavigatorWithOptionalStorage).storage;

  return {
    platform: detectPlatform(),
    installed: standaloneQuery || legacyStandalone,
    standalone: standaloneQuery || legacyStandalone,
    webPush:
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    serviceWorker: "serviceWorker" in navigator,
    opfs: typeof storage?.getDirectory === "function",
    webAuthn: "PublicKeyCredential" in window && "credentials" in navigator,
    webCrypto: "crypto" in globalThis && "subtle" in globalThis.crypto,
    filePicker: "showOpenFilePicker" in window,
    shareApi: "share" in navigator,
    notificationPermission:
      "Notification" in window ? Notification.permission : "unsupported",
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches
  };
}

export function describeCapability(value: boolean): "Available" | "Unavailable" {
  return value ? "Available" : "Unavailable";
}
