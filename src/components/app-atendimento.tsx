"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Smartphone, AlertCircle } from "lucide-react";

// Faz o painel de atendimento virar APP no celular.
//
// Por que existe: o atendente precisa ser avisado no telefone e entrar no
// sistema pra responder. Ate 3/Nov/2026 o site nao tinha manifest nem
// service worker — nao instalava e nao notificava.
//
// Esta peca cuida de: registrar o service worker, pedir permissao de aviso
// (so' no clique, que e' exigencia do iOS) e MOSTRAR o estado real. Nada de
// dizer "avisos ligados" sem ter conferido.
//
// LIMITE QUE EU NAO ESCONDO: aviso com o app FECHADO precisa de push de
// verdade, que exige chave VAPID no ambiente e uma tabela pra guardar as
// inscricoes. Enquanto isso nao existir, o aviso so' aparece com o painel
// aberto (inclusive em segundo plano no Android). O painel diz isso na cara.

type Estado = "carregando" | "sem_suporte" | "negado" | "permitido" | "pendente";

export function AppAtendimento() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [instalado, setInstalado] = useState(false);
  const [ehIos, setEhIos] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let vivo = true;

    // O trabalho roda em promessa de proposito: a regra de lint da casa
    // proibe setState sincrono dentro de efeito (gera render em cascata).
    (async () => {
      const temSuporte = "serviceWorker" in navigator && "Notification" in window;
      let motivo = "";

      if (temSuporte) {
        try {
          await navigator.serviceWorker.register("/sw.js");
        } catch (e) {
          motivo = e instanceof Error ? e.message : "falhou registrar o app";
        }
      } else {
        await Promise.resolve();
      }
      if (!vivo) return;

      // iOS so' deixa notificar quando o app esta na tela de inicio.
      setEhIos(/iPad|iPhone|iPod/.test(window.navigator.userAgent));
      setInstalado(
        window.matchMedia?.("(display-mode: standalone)").matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true,
      );
      if (motivo) setErro(motivo);

      if (!temSuporte || motivo) {
        setEstado("sem_suporte");
        return;
      }
      const p = Notification.permission;
      setEstado(p === "granted" ? "permitido" : p === "denied" ? "negado" : "pendente");
    })();

    return () => {
      vivo = false;
    };
  }, []);

  const pedirPermissao = useCallback(async () => {
    setErro("");
    try {
      const r = await Notification.requestPermission();
      setEstado(r === "granted" ? "permitido" : r === "denied" ? "negado" : "pendente");
      if (r === "granted") {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification("Pegue — avisos ligados", {
          body: "É assim que o aviso vai chegar quando um cliente estiver esperando.",
          icon: "/icone-192.png",
          badge: "/icone-192.png",
        });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "o navegador recusou o pedido");
    }
  }, []);

  const testar = useCallback(async () => {
    setErro("");
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Pegue — cliente esperando", {
        body: "Teste. Toca aqui pra abrir a conversa.",
        icon: "/icone-192.png",
        badge: "/icone-192.png",
        data: { url: "/admin/conversa" },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui mostrar o aviso");
    }
  }, []);

  if (estado === "carregando") return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 text-sm">
      <h2 className="font-bold mb-2 flex items-center gap-2 text-orange-400">
        <Smartphone className="w-4 h-4" />
        Avisos no celular
      </h2>

      {estado === "sem_suporte" && (
        <p className="text-xs text-gray-400">
          Este navegador não aceita avisos. Abre o painel no Chrome (Android) ou instala na tela
          de início (iPhone).
        </p>
      )}

      {estado === "negado" && (
        <p className="flex items-start gap-2 text-xs text-red-400">
          <BellOff className="w-4 h-4 shrink-0" />
          Você negou os avisos neste aparelho. Pra voltar atrás é nas configurações do navegador —
          no iPhone, tira o app da tela de início e instala de novo.
        </p>
      )}

      {estado === "pendente" && (
        <>
          {ehIos && !instalado ? (
            <p className="flex items-start gap-2 text-xs text-yellow-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              No iPhone o aviso só funciona com o painel instalado: toca em Compartilhar e depois
              em &quot;Adicionar à Tela de Início&quot;. Depois abre por lá e volta aqui.
            </p>
          ) : (
            <button
              type="button"
              onClick={pedirPermissao}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white"
            >
              <Bell className="w-4 h-4" /> Ligar avisos neste aparelho
            </button>
          )}
        </>
      )}

      {estado === "permitido" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-green-400">
            <Bell className="w-4 h-4" /> Avisos ligados neste aparelho
            {instalado ? " (app instalado)" : " (no navegador)"}
          </span>
          <button
            type="button"
            onClick={testar}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300"
          >
            Testar aviso
          </button>
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      <p className="mt-3 text-xs text-gray-600">
        Hoje o aviso aparece com o painel aberto, inclusive em segundo plano no Android. Aviso com
        o app totalmente fechado ainda não está ligado — falta a chave de envio no ambiente.
      </p>
    </div>
  );
}
