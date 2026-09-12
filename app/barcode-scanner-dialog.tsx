"use client";

import type { IScannerControls } from "@zxing/browser";
import {
  Camera,
  Flashlight,
  FlashlightOff,
  Focus,
  ImageUp,
  Keyboard,
  Loader2,
  ScanBarcode,
  Search,
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";

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

type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean | boolean[];
  zoom?: { min: number; max: number; step?: number };
};

type CameraConstraintSet = MediaTrackConstraintSet & {
  focusMode?: "continuous" | "single-shot";
  torch?: boolean;
  zoom?: number;
};

const preferredCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { exact: "environment" },
    width: { ideal: 1920, min: 960 },
    height: { ideal: 1080, min: 540 },
    frameRate: { ideal: 30, max: 30 },
  },
};

const fallbackCameraConstraints: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

const maxBarcodeImageBytes = 12 * 1024 * 1024;

async function applyAdvancedCameraConstraint(
  track: MediaStreamTrack,
  constraint: CameraConstraintSet,
) {
  await track.applyConstraints({
    advanced: [constraint as MediaTrackConstraintSet],
  });
}

const scannerCopy = {
  fr: {
    title: "Scanner un produit",
    description: "Visez son code-barres : le produit sera ajouté directement au panier.",
    start: "Activer la caméra",
    upload: "Importer une photo",
    readingImage: "Lecture de la photo…",
    scanning: "Gardez le code à 15–25 cm, bien à plat dans le cadre",
    refocus: "Refaire la mise au point",
    torchOn: "Allumer la lampe",
    torchOff: "Éteindre la lampe",
    manual: "ou saisir le code",
    label: "Numéro du code-barres",
    placeholder: "Ex. 3017624010701",
    lookup: "Rechercher",
    invalid: "Saisissez un code-barres de 8 à 14 chiffres.",
    imageInvalid: "Choisissez une image contenant un code-barres.",
    imageTooLarge: "Cette image est trop lourde (12 Mo maximum).",
    imageNotFound: "Aucun code-barres lisible dans cette image.",
    permission: "Autorisez la caméra, puis réessayez. Vous pouvez aussi saisir le code.",
    source: "Recherche d’abord dans MyMarket, puis dans Open Food Facts. Josef confirme le prix réel.",
    fallback: "Impossible d’ouvrir la caméra. Saisissez le code ci-dessous.",
  },
  ar: {
    title: "مسح منتج",
    description: "وجّه الكاميرا نحو الرمز وسيُضاف المنتج مباشرة إلى السلة.",
    start: "تشغيل الكاميرا",
    upload: "رفع صورة",
    readingImage: "جارٍ قراءة الصورة…",
    scanning: "أبقِ الرمز على بُعد 15–25 سم وبشكل مستقيم داخل الإطار",
    refocus: "إعادة التركيز",
    torchOn: "تشغيل الضوء",
    torchOff: "إطفاء الضوء",
    manual: "أو أدخل الرمز",
    label: "رقم الرمز الشريطي",
    placeholder: "مثال 3017624010701",
    lookup: "بحث",
    invalid: "أدخل رمزاً من 8 إلى 14 رقماً.",
    imageInvalid: "اختر صورة تحتوي على رمز شريطي.",
    imageTooLarge: "حجم الصورة كبير جداً (الحد الأقصى 12 ميغابايت).",
    imageNotFound: "لم يتم العثور على رمز شريطي واضح في الصورة.",
    permission: "اسمح باستخدام الكاميرا ثم أعد المحاولة، أو أدخل الرمز يدوياً.",
    source: "يبدأ البحث في MyMarket ثم Open Food Facts. يؤكد جوزيف السعر الحقيقي.",
    fallback: "تعذر تشغيل الكاميرا. أدخل الرمز أدناه.",
  },
  en: {
    title: "Scan a product",
    description: "Point at its barcode and the product will be added directly to the cart.",
    start: "Turn on camera",
    upload: "Upload a photo",
    readingImage: "Reading photo…",
    scanning: "Hold it flat, 15–25 cm away, inside the frame",
    refocus: "Refocus camera",
    torchOn: "Turn on light",
    torchOff: "Turn off light",
    manual: "or enter the code",
    label: "Barcode number",
    placeholder: "Example: 3017624010701",
    lookup: "Search",
    invalid: "Enter a barcode containing 8 to 14 digits.",
    imageInvalid: "Choose an image that contains a barcode.",
    imageTooLarge: "This image is too large (12 MB maximum).",
    imageNotFound: "No readable barcode was found in this image.",
    permission: "Allow camera access and try again, or enter the code manually.",
    source: "Searches MyMarket first, then Open Food Facts. Josef confirms the real price.",
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
  const [imageBusy, setImageBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lookupControllerRef = useRef<AbortController | null>(null);
  const cameraAttemptRef = useRef(0);
  const detectedRef = useRef(false);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const [focusAvailable, setFocusAvailable] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const t = scannerCopy[language];

  const stopCamera = useCallback(() => {
    cameraAttemptRef.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    cameraTrackRef.current = null;
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
        setImageBusy(false);
        setCameraStatus("idle");
        setFocusAvailable(false);
        setTorchAvailable(false);
        setTorchOn(false);
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

  const optimizeCameraTrack = async (
    track: MediaStreamTrack,
    controls: IScannerControls,
  ) => {
    const capabilities = track.getCapabilities() as CameraCapabilities;
    const focusModes = capabilities.focusMode ?? [];
    const preferredFocusMode = focusModes.includes("continuous")
      ? "continuous"
      : focusModes.includes("single-shot")
        ? "single-shot"
        : null;

    if (preferredFocusMode) {
      try {
        await applyAdvancedCameraConstraint(track, { focusMode: preferredFocusMode });
        setFocusAvailable(true);
      } catch {
        setFocusAvailable(false);
      }
    }

    const zoom = capabilities.zoom;
    if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) {
      const helpfulZoom = Math.min(zoom.max, Math.max(zoom.min, 1.4));
      if (helpfulZoom > zoom.min) {
        try {
          await applyAdvancedCameraConstraint(track, { zoom: helpfulZoom });
        } catch {
          // The camera can still scan without browser-controlled zoom.
        }
      }
    }

    const canControlTorch = Array.isArray(capabilities.torch)
      ? capabilities.torch.includes(true) && capabilities.torch.includes(false)
      : capabilities.torch === true;
    setTorchAvailable(Boolean(controls.switchTorch) || canControlTorch);
  };

  const refocusCamera = async () => {
    const track = cameraTrackRef.current;
    if (!track) return;
    const capabilities = track.getCapabilities() as CameraCapabilities;
    const focusModes = capabilities.focusMode ?? [];

    try {
      if (focusModes.includes("single-shot")) {
        await applyAdvancedCameraConstraint(track, { focusMode: "single-shot" });
        if (focusModes.includes("continuous")) {
          window.setTimeout(() => {
            if (cameraTrackRef.current === track) {
              void applyAdvancedCameraConstraint(track, { focusMode: "continuous" }).catch(
                () => undefined,
              );
            }
          }, 700);
        }
      } else if (focusModes.includes("continuous")) {
        await applyAdvancedCameraConstraint(track, { focusMode: "continuous" });
      }
    } catch {
      setFocusAvailable(false);
    }
  };

  const toggleTorch = async () => {
    const controls = controlsRef.current;
    const track = cameraTrackRef.current;
    if (!controls || !track) return;
    const nextTorchState = !torchOn;

    try {
      if (controls.switchTorch) {
        await controls.switchTorch(nextTorchState);
      } else {
        await applyAdvancedCameraConstraint(track, { torch: nextTorchState });
      }
      setTorchOn(nextTorchState);
    } catch {
      setTorchAvailable(false);
      setTorchOn(false);
    }
  };

  const startCamera = async () => {
    stopCamera();
    const cameraAttempt = cameraAttemptRef.current;
    setError("");
    detectedRef.current = false;
    setCameraStatus("starting");
    setFocusAvailable(false);
    setTorchAvailable(false);
    setTorchOn(false);

    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setCameraStatus("idle");
      setError(t.fallback);
      return;
    }

    try {
      const { BarcodeFormat, BrowserMultiFormatOneDReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatOneDReader(undefined, {
        delayBetweenScanAttempts: 250,
        tryPlayVideoTimeout: 7_000,
      });
      reader.possibleFormats = [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ];
      const handleResult: Parameters<typeof reader.decodeFromConstraints>[2] = (
        result,
        _scanError,
        activeControls,
      ) => {
        if (cameraAttemptRef.current !== cameraAttempt) {
          activeControls.stop();
          return;
        }
        if (!result || detectedRef.current) return;
        detectedRef.current = true;
        activeControls.stop();
        controlsRef.current = null;
        cameraTrackRef.current = null;
        setCameraStatus("idle");
        void lookup(result.getText());
      };

      let controls: IScannerControls;
      try {
        controls = await reader.decodeFromConstraints(
          preferredCameraConstraints,
          videoRef.current,
          handleResult,
        );
      } catch (preferredCameraError) {
        if (
          preferredCameraError instanceof DOMException &&
          preferredCameraError.name === "NotAllowedError"
        ) {
          throw preferredCameraError;
        }
        controls = await reader.decodeFromConstraints(
          fallbackCameraConstraints,
          videoRef.current,
          handleResult,
        );
      }

      if (cameraAttemptRef.current !== cameraAttempt || detectedRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      const stream = videoRef.current.srcObject;
      const track = stream instanceof MediaStream ? stream.getVideoTracks()[0] : undefined;
      if (track) {
        cameraTrackRef.current = track;
        await optimizeCameraTrack(track, controls);
      }
      if (cameraAttemptRef.current !== cameraAttempt || detectedRef.current) {
        controls.stop();
        return;
      }
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

  const scanBarcodeImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t.imageInvalid);
      return;
    }
    if (file.size > maxBarcodeImageBytes) {
      setError(t.imageTooLarge);
      return;
    }

    stopCamera();
    const imageAttempt = cameraAttemptRef.current;
    setCameraStatus("idle");
    setImageBusy(true);
    setError("");
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BarcodeFormat, BrowserMultiFormatOneDReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatOneDReader();
      reader.possibleFormats = [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ];
      const result = await reader.decodeFromImageUrl(imageUrl);
      if (cameraAttemptRef.current !== imageAttempt) return;
      await lookup(result.getText());
    } catch {
      if (cameraAttemptRef.current === imageAttempt) setError(t.imageNotFound);
    } finally {
      URL.revokeObjectURL(imageUrl);
      if (cameraAttemptRef.current === imageAttempt) setImageBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className="max-h-[94svh] overflow-hidden rounded-[1.5rem] border-border bg-card p-0 sm:max-w-lg"
        dir={language === "ar" ? "rtl" : "ltr"}
        lang={language}
      >
        <div className="grid max-h-[94svh] gap-4 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pe-10">
          <div className="mb-1 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
              <ScanBarcode className="size-5" />
            </span>
            <DialogTitle className="text-xl">{t.title}</DialogTitle>
          </div>
          <DialogDescription className="leading-6">{t.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="h-11 rounded-xl"
            onClick={() => void startCamera()}
            disabled={cameraStatus !== "idle" || lookupBusy || imageBusy}
          >
            {cameraStatus === "starting" ? <Loader2 className="animate-spin" /> : <Camera />}
            {t.start}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => fileInputRef.current?.click()}
            disabled={lookupBusy || imageBusy}
          >
            {imageBusy ? <Loader2 className="animate-spin" /> : <ImageUp />}
            {imageBusy ? t.readingImage : t.upload}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => void scanBarcodeImage(event)}
          />
        </div>

        <div
          className={`relative aspect-video max-h-[34svh] overflow-hidden rounded-2xl bg-[#08110f] ${
            cameraStatus === "idle" ? "hidden" : ""
          }`}
        >
          <video ref={videoRef} muted playsInline className="size-full object-cover" />
          {cameraStatus === "scanning" ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
              <div className="h-28 w-[78%] rounded-xl border-2 border-[#7de1c4] shadow-[0_0_0_999px_rgba(0,0,0,0.30)]" />
              {(focusAvailable || torchAvailable) && (
                <div className="pointer-events-auto absolute end-3 top-3 flex gap-2">
                  {focusAvailable && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="size-11 rounded-full bg-black/70 text-white hover:bg-black/85 hover:text-white"
                      onClick={() => void refocusCamera()}
                      aria-label={t.refocus}
                      title={t.refocus}
                    >
                      <Focus />
                    </Button>
                  )}
                  {torchAvailable && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="size-11 rounded-full bg-black/70 text-white hover:bg-black/85 hover:text-white"
                      onClick={() => void toggleTorch()}
                      aria-label={torchOn ? t.torchOff : t.torchOn}
                      aria-pressed={torchOn}
                      title={torchOn ? t.torchOff : t.torchOn}
                    >
                      {torchOn ? <FlashlightOff /> : <Flashlight />}
                    </Button>
                  )}
                </div>
              )}
              <p className="absolute bottom-4 rounded-full bg-black/65 px-4 py-2 text-xs font-medium text-white">
                {t.scanning}
              </p>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-black/15 to-black/55">
              <Loader2 className="size-7 animate-spin text-white" />
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
            <Button
              type="submit"
              className="h-11 rounded-xl"
              disabled={lookupBusy}
              aria-label={t.lookup}
            >
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
