// Systembenachrichtigungen (über den Service Worker, wenn vorhanden – nötig für Android).

export function notificationsSupported() {
  return 'Notification' in window;
}

export async function requestPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export async function notify(title, body, { tag, onlyWhenHidden = true } = {}) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  if (onlyWhenHidden && !document.hidden) return false;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: tag ?? 'unikram', renotify: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(title, opts); return true; }
  } catch { /* Fallback */ }
  try { new Notification(title, opts); return true; } catch { return false; }
}
