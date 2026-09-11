"use client";

import type { IScannerControls } from "@zxing/browser";
import { Camera, Keyboard, Loader2, ScanBarcode, Search } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Language = "fr" | "ar" | "en";

export type ScannedCatalogProduct = {
  id: number;
  name_fr: string;
  name_ar: string;
  name_en: string;
  category: string;
  unit: "L" | "kg" | "pièce";
  unit_price_cents: number;
  image_position: string;
  image_url: string | null;
  barcode: string | null;
  package_size: string | null;
  purchase_count: number;
};

const scannerCopy = {
  fr: {
    title: "Scanner un produit",
    description: "Visez son code-barres : le produit sera ajouté directement au panier.",
    start: "Activer la caméra",
    scanning: "Placez le code-barres dans le cadre",
    manual: "ou saisir le code",
    label: "Numéro du code-barres",
    placeholder: "Ex. 3017624010701",
    lookup: "Rechercher",
    invalid: "Saisissez un code-barres de 8 à 14 chiffres.",
    permission: "Autorisez la caméra, puis réessayez. Vous pouvez aussi saisir le code.",
    source: "Nom, format et photo via Open Food Facts. Le prix réel sera confirmé par Salma.",
    fallback: "Impossible d’ouvrir la caméra. Saisissez le code ci-dessous.",
  },
  ar: {
    title: "مسح منتج",
    description: "وجّه الكاميرا نحو الرمز وسيُضاف المنتج مباشرة إلى السلة.",
    start: "تشغيل الكاميرا",
    scanning: "ضع الرمز داخل الإطار",
    manual: "أو أدخل الرمز",
    label: "رقم الرمز الشريطي",
    placeholder: "مثال 3017624010701",
    lookup: "بحث",
    invalid: "أدخل رمزاً من 8 إلى 14 رقماً.",
    permission: "اسمح باستخدام الكاميرا ثم أعد المحاولة، أو أدخل الرمز يدوياً.",
    source: "الاسم والحجم والصورة من Open Food Facts. تؤكد سلمى السعر الحقيقي.",
    fallback: "تعذر تشغيل الكاميرا. أدخل الرمز أدناه.",
  },
  en: {
    title: "Scan a product",
    description: "Point at its barcode and the product will be added directly to the cart.",
    start: "Turn on camera",
    scanning: "Place the barcode inside the frame",
    manual: "or enter the code",
    label: "Barcode number",
    placeholder: "Example: 3017624010701",
    lookup: "Search",
    invalid: "Enter a barcode containing 8 to 14 digits.",
    permission: "Allow camera access and try again, or enter the code manually.",
    source: "Name, pack size, and photo come from Open Food Facts. Salma confirms the real price.",
    fallback: "The camera could not open. Enter the code below.",
  },
} as const;

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  language,
  onProduct,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: Language;
  onProduct: (product: ScannedCatalogProduct) => void;
}) {
  const [barcode, setBarcode] = useState("");
  const [cameraStatus, setCameraStatus] = useState<"idle" | "starting" | "scanning">("idle");
  const [error, setError] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const cameraAttemptRef = useRef(0);
  const detectedRef = useRef(false);
  const t = scannerCopy[language];

  const stopCamera = useCallback(() => {
    cameraAttemptRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(
    () => () => {
      stopCamera();
      lookupControllerRef.current?.abort();
    },
    [stopCamera],
  );

  const changeOpen = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        stopCamera();
        lookupControllerRef.current?.abort();
        lookupControllerRef.current = null;
        setBarcode("");
        setError("");
        setLookupBusy(false);
        setCameraStatus("idle");
        detectedRef.current = false;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, stopCamera],
  );

  const lookup = useCallback(
    async (rawCode: string) => {
      const normalized = rawCode.replace(/[^0-9]/g, "");
      setBarcode(normalized);
      if (!/^\d{8,14}$/.test(normalized)) {
        setError(t.invalid);
        return;
      }

      setLookupBusy(true);
      setError("");
      lookupControllerRef.current?.abort();
      const controller = new AbortController();
      lookupControllerRef.current = controller;
      try {
        const response = await fetch("/api/products/barcode", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ barcode: normalized }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          product?: ScannedCatalogProduct;
          error?: string;
        };
        if (response.status === 401) {
          window.location.replace("/connexion");
          return;
        }
        if (!response.ok || !payload.product) {
          throw new Error(payload.error || "Produit introuvable.");
        }

        onProduct(payload.product);
        changeOpen(false);
      } catch (lookupError) {
        if (controller.signal.aborted) return;
        setError(lookupError instanceof Error ? lookupError.message : "Produit introuvable.");
      } finally {
        if (lookupControllerRef.current === controller) {
          lookupControllerRef.current = null;
          setLookupBusy(false);
        }
      }
    },
    [changeOpen, onProduct, t.invalid],
  );

  const startCamera = async () => {
    stopCamera();
    const cameraAttempt = cameraAttemptRef.current;
    setError("");
    detectedRef.current = false;
    setCameraStatus("starting");

    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setCameraStatus("idle");
      setError(t.fallback);
      return;
    }

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (result, _scanError, activeControls) => {
          if (cameraAttemptRef.current !== cameraAttempt) {
            activeControls.stop();
            return;
          }
          if (!result || detectedRef.current) return;
          detectedRef.current = true;
          activeControls.stop();
          controlsRef.current = null;
          setCameraStatus("idle");
          void lookup(result.getText());
        },
      );
      if (cameraAttemptRef.current !== cameraAttempt) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setCameraStatus("scanning");
    } catch (cameraError) {
      if (cameraAttemptRef.current !== cameraAttempt) return;
      stopCamera();
      setCameraStatus("idle");
      setError(
        cameraError instanceof DOMException && cameraError.name === "NotAllowedError"
          ? t.permission
          : t.fallback,
      );
    }
  };

  const submitManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void lookup(barcode);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-[1.75rem] border-border bg-card sm:max-w-xl">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
              <ScanBarcode className="size-5" />
            </span>
            <DialogTitle className="text-xl">{t.title}</DialogTitle>
          </div>
          <DialogDescription className="leading-6">{t.description}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#08110f]">
          <video ref={videoRef} muted playsInline className="size-full object-cover" />
          {cameraStatus === "scanning" ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
              <div className="h-28 w-[78%] rounded-xl border-2 border-[#7de1c4] shadow-[0_0_0_999px_rgba(0,0,0,0.30)]" />
              <p className="absolute bottom-4 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white">
                {t.scanning}
              </p>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/15 to-black/55 p-6 text-center">
              <Button
                type="button"
                className="rounded-xl"
                onClick={() => void startCamera()}
                disabled={cameraStatus === "starting" || lookupBusy}
              >
                {cameraStatus === "starting" ? <Loader2 className="animate-spin" /> : <Camera />}
                {t.start}
              </Button>
            </div>
          )}
        </div>

        <div className="relative my-1 flex items-center justify-center">
          <span className="absolute inset-x-0 h-px bg-border" />
          <span className="relative flex items-center gap-2 bg-card px-3 text-xs text-muted-foreground">
            <Keyboard className="size-3.5" /> {t.manual}
          </span>
        </div>

        <form onSubmit={submitManual} className="grid gap-2">
          <Label htmlFor="manual-barcode">{t.label}</Label>
          <div className="flex gap-2">
            <Input
              id="manual-barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value.replace(/[^0-9]/g, "").slice(0, 14))}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t.placeholder}
              className="h-11 rounded-xl"
            />
            <Button type="submit" className="h-11 rounded-xl" disabled={lookupBusy}>
              {lookupBusy ? <Loader2 className="animate-spin" /> : <Search />}
              <span className="hidden sm:inline">{t.lookup}</span>
            </Button>
          </div>
        </form>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs leading-5 text-muted-foreground">{t.source}</p>
      </DialogContent>
    </Dialog>
  );
}
