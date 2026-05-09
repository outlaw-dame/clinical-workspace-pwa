import { registerSW } from "virtual:pwa-register";

export async function registerAppServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  await Promise.resolve();

  try {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(swUrl, registration) {
        void swUrl;

        if (!registration) return;

        window.setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      },
      onRegisterError(error) {
        console.warn("Service worker registration failed", error);
      },
      onNeedRefresh() {
        void updateSW(true);
      }
    });
  } catch (error) {
    console.warn("Service worker setup failed", error);
  }
}
