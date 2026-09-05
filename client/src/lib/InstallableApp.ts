/**
 * D-Fence — the parts of "it is a mobile app" that are code rather than markup.
 * Traces: 11.8.7, 11.8.8, 11.8.9, 11.8.11, 11.8.12.
 *
 * Three small things, kept together because they are one feature: register the service worker,
 * offer the install control while installation is still possible, and know whether the device is
 * actually offline so a screen can say so in its own words instead of showing a browser error page.
 *
 * Every function here is written to be **absent-safe**. `serviceWorker`, `matchMedia` and
 * `beforeinstallprompt` are all optional in a browser and all missing in jsdom, and a client that
 * throws on a phone with an unusual browser is worse than one that simply cannot be installed on
 * it.
 */
import { useEffect, useState } from 'react';

/**
 * The event Chrome fires when it is willing to install the application. It is not in TypeScript's
 * DOM library because it is not in a specification either — Safari and Firefox never fire it, and
 * on those the install control simply never appears, which is the correct outcome.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * 11.8.7 — register the worker, once, after load.
 *
 * Deliberately **not** awaited and deliberately not blocking the first render: a registration that
 * fails, or a browser that has no `serviceWorker` at all, must cost the user nothing. The
 * application works without it; the worker only adds the offline case.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  // After `load`, so registration competes with nothing that the user is waiting for.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      // Logged rather than shown. There is no action a user could take, and 10.5.3's obligation to
      // state a remedy is not satisfiable for a failure that costs them nothing.
      console.warn(`service worker registration failed: ${String(error)}`);
    });
  });
}

/** True when the application is running installed rather than in a browser tab (11.8.12). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true;
  // iOS never adopted `display-mode` and reports this instead.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

/**
 * 11.8.12 — the install control, and when to stop offering it.
 *
 * The browser decides whether installation is possible, so the control appears only after the
 * browser says so. It disappears once the application is installed, because an install button
 * inside an installed application is an offer that cannot be taken.
 */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<boolean> } {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || isInstalled()) {
      return;
    }
    const onPrompt = (event: Event): void => {
      // Chrome shows its own bar unless the event is cancelled; cancelling it and offering the
      // control inside the page is what puts the offer where the user is looking.
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = (): void => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return {
    canInstall: prompt !== null,
    install: async () => {
      if (prompt === null) {
        return false;
      }
      await prompt.prompt();
      const choice = await prompt.userChoice;
      // Single use: the browser will not let the same event be shown twice, so keeping it would
      // leave a button that silently does nothing.
      setPrompt(null);
      return choice.outcome === 'accepted';
    },
  };
}

/**
 * 11.8.9 — whether the device believes it is online.
 *
 * `navigator.onLine` is a weak signal (it means "there is a network interface", not "the internet
 * works"), which is why it is used only to *phrase* a failure that has already happened rather
 * than to decide whether to try. A request is always attempted; if it fails and this is false, the
 * user is told they are offline instead of being told the server could not be reached.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** The sentence a screen shows when a request failed and the device is offline (11.8.9). */
export const OFFLINE_CAUSE = 'You are offline';
export const OFFLINE_REMEDY = 'reconnect and try again — nothing you typed has been lost';
