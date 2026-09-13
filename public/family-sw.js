self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open("family-expense-shell-v1")
      .then((cache) =>
        cache.addAll([
          "/offline.html",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("family-expense-") && key !== "family-expense-shell-v1")
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match("/offline.html")),
  );
});

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
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
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
