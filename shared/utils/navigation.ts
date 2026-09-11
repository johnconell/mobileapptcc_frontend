import type { Href, Router } from 'expo-router';

/** Go back if history exists; otherwise replace to a known screen. */
export function safeBack(router: Router, fallback: Href) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
