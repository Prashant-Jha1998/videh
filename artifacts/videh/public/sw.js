self.addEventListener("push", (event) => {
  let payload = { title: "Videh", body: "", data: {} };
  try {
    payload = event.data?.json() ?? payload;
  } catch {
    payload.body = event.data?.text() ?? "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Videh", {
      body: payload.body ?? "",
      data: payload.data ?? {},
      icon: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const chatId = event.notification?.data?.chatId;
  const url = chatId ? `/?chat=${chatId}` : "/";
  event.waitUntil(clients.openWindow(url));
});
