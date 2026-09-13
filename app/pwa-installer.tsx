"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "family-expense-install-dismissed";

export function PwaInstaller() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/family-sw.js");
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    if (standalone || window.localStorage.getItem(DISMISSED_KEY) === "yes") return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    let iosTimer: number | undefined;
    if (isIos) {
      iosTimer = window.setTimeout(() => {
        setShowIosHelp(true);
        setVisible(true);
      }, 0);
    }

    return () => {
      if (iosTimer) window.clearTimeout(iosTimer);
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "yes");
    setVisible(false);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallPrompt(null);
  };

  if (!visible) return null;

  return (
    <aside
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur-xl lg:bottom-5"
      aria-label="Installer l’application"
    >
      <Image
        src="/icons/icon-192.png"
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Installer Dépenses famille</p>
        {showIosHelp ? (
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
            Touchez <Share className="mx-0.5 inline size-3" /> puis « Sur l’écran d’accueil ».
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Accès rapide depuis votre écran d’accueil.</p>
        )}
      </div>
      {!showIosHelp && (
        <Button type="button" size="sm" className="shrink-0 rounded-xl" onClick={() => void install()}>
          <Download /> Installer
        </Button>
      )}
      <Button type="button" size="icon-sm" variant="ghost" className="shrink-0" onClick={dismiss} aria-label="Fermer">
        <X />
      </Button>
    </aside>
  );
}
