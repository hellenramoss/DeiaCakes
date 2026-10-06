const ENABLED_KEY = "deia-notifications-enabled";

export function notificationsSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

export function notificationsEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== "0";
}

export function setNotificationsEnabled(enabled: boolean) {
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent("deia-notification-setting"));
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported" as const;
  const permission = await Notification.requestPermission();
  return permission;
}

export async function showAppNotification(title: string, body: string, tag?: string) {
  if (!notificationsSupported() || !notificationsEnabled() || Notification.permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      tag,
      icon: "/DeiaCakes/deia-logo.webp",
      badge: "/DeiaCakes/deia-logo.webp"
    });
  } catch {
    new Notification(title, { body, tag, icon: "/DeiaCakes/deia-logo.webp" });
  }
}

export async function notifyUpcomingDeliveries(orders: Array<{
  id: string;
  customerName: string;
  deliveryDate: string;
  status: string;
}>) {
  if (!notificationsEnabled() || notificationPermission() !== "granted") return;

  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);

  const todayOrders = orders.filter((order) =>
    order.deliveryDate === today &&
    order.status !== "Cancelado" &&
    order.status !== "Entregue"
  );

  const tomorrowOrders = orders.filter((order) =>
    order.deliveryDate === tomorrow &&
    order.status !== "Cancelado" &&
    order.status !== "Entregue"
  );

  if (todayOrders.length) {
    const key = `deia-notified-today-${today}`;
    if (!localStorage.getItem(key)) {
      const names = todayOrders.slice(0, 3).map((order) => order.customerName).join(", ");
      const extra = todayOrders.length > 3 ? ` e mais ${todayOrders.length - 3}` : "";
      await showAppNotification(
        "Entregas de hoje",
        `${todayOrders.length} pedido(s): ${names}${extra}`,
        `deliveries-${today}`
      );
      localStorage.setItem(key, "1");
    }
  }

  if (tomorrowOrders.length) {
    const key = `deia-notified-tomorrow-${tomorrow}`;
    if (!localStorage.getItem(key)) {
      const names = tomorrowOrders.slice(0, 3).map((order) => order.customerName).join(", ");
      const extra = tomorrowOrders.length > 3 ? ` e mais ${tomorrowOrders.length - 3}` : "";
      await showAppNotification(
        "Entregas de amanhã",
        `${tomorrowOrders.length} pedido(s): ${names}${extra}`,
        `deliveries-${tomorrow}`
      );
      localStorage.setItem(key, "1");
    }
  }
}
