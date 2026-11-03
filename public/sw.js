// Service worker do painel de atendimento da Pegue.
//
// Existe por DOIS motivos, nesta ordem:
//   1. sem service worker + manifest, o painel nao instala no celular;
//   2. no iPhone, notificacao web SO' funciona com o app instalado na tela
//      de inicio (iOS 16.4+). No Android funciona depois de permitir.
//
// De proposito ele NAO faz cache de nada. Painel de atendimento mostrando
// conversa velha e' pior que painel lento: o atendente responderia olhando
// mensagem que ja mudou.

self.addEventListener("install", () => {
  // Assume o controle ja' na primeira visita, sem esperar recarregar.
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(self.clients.claim());
});

// Aviso chegando com o app fechado.
self.addEventListener("push", (evento) => {
  let dados = { titulo: "Pegue", corpo: "Cliente esperando atendimento.", url: "/admin/conversa" };
  try {
    if (evento.data) dados = { ...dados, ...evento.data.json() };
  } catch {
    // Push sem JSON valido: mostra o aviso generico em vez de engolir.
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      vibrate: [200, 100, 200],
      tag: dados.tag || "pegue-atendimento",
      renotify: true,
      data: { url: dados.url },
    }),
  );
});

// Tocar no aviso abre a conversa — e reaproveita a janela se ja estiver aberta.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = (evento.notification.data && evento.notification.data.url) || "/admin/conversa";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.includes("/admin") && "focus" in janela) {
          janela.navigate(destino);
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
