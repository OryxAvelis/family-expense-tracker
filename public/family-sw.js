self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }

  event.waitUntil(
    self.registration.showNotification(message.title || "Dépenses famille", {
      body: message.body || "Une nouvelle commande est disponible.",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: message.tag || "family-order",
      renotify: true,
      vibrate: [180, 80, 180],
      data: { url: message.url || "/livreur" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/livreur", self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        for (const windowClient of windows) {
          if ("navigate" in windowClient) await windowClient.navigate(destination);
          if ("focus" in windowClient) return windowClient.focus();
        }
        return self.clients.openWindow(destination);
      }),
  );
});
