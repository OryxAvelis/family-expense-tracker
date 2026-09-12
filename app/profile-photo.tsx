"use client";

import { Camera, Check, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProfileLanguage = "fr" | "ar" | "en";

export type ProfileUser = {
  id: number;
  name: string;
  initials: string;
};

const MAX_PROFILE_IMAGE_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const profileCopy = {
  fr: {
    choose: "Choisir une photo",
    change: "Changer la photo",
    save: "Enregistrer",
    remove: "Supprimer",
    cancel: "Annuler",
    hint: "JPG, PNG ou WebP · 3 Mo maximum. Visible uniquement par la famille.",
    invalid: "Choisissez une photo JPG, PNG ou WebP.",
    tooLarge: "La photo ne doit pas dépasser 3 Mo.",
    saved: "Photo de profil mise à jour.",
    removed: "Photo de profil supprimée.",
    preview: "Aperçu de la nouvelle photo",
    edit: "Modifier la photo de profil",
  },
  ar: {
    choose: "اختيار صورة",
    change: "تغيير الصورة",
    save: "حفظ",
    remove: "حذف",
    cancel: "إلغاء",
    hint: "JPG أو PNG أو WebP · بحد أقصى 3 ميغابايت. تظهر للعائلة فقط.",
    invalid: "اختر صورة JPG أو PNG أو WebP.",
    tooLarge: "يجب ألا تتجاوز الصورة 3 ميغابايت.",
    saved: "تم تحديث صورة الملف الشخصي.",
    removed: "تم حذف صورة الملف الشخصي.",
    preview: "معاينة الصورة الجديدة",
    edit: "تعديل صورة الملف الشخصي",
  },
  en: {
    choose: "Choose a photo",
    change: "Change photo",
    save: "Save",
    remove: "Remove",
    cancel: "Cancel",
    hint: "JPG, PNG, or WebP · 3 MB maximum. Visible only to the family.",
    invalid: "Choose a JPG, PNG, or WebP photo.",
    tooLarge: "The photo must be 3 MB or smaller.",
    saved: "Profile photo updated.",
    removed: "Profile photo removed.",
    preview: "New profile photo preview",
    edit: "Edit profile photo",
  },
} as const;

export function ProfileAvatar({
  user,
  version = 0,
  className,
  onAvailabilityChange,
}: {
  user: ProfileUser;
  version?: number;
  className?: string;
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const source = `/api/profile/image?userId=${user.id}&v=${version}`;
  const [failedSource, setFailedSource] = useState<string | null>(null);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-primary/12 font-bold text-primary",
        className,
      )}
    >
      <span aria-hidden="true">{user.initials}</span>
      {failedSource !== source && (
        // A normal img is used because this authenticated route is not a static Next image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onLoad={() => onAvailabilityChange?.(true)}
          onError={() => {
            setFailedSource(source);
            onAvailabilityChange?.(false);
          }}
        />
      )}
    </span>
  );
}

export function ProfilePhotoEditor({
  user,
  language,
  version,
  onChanged,
}: {
  user: ProfileUser;
  language: ProfileLanguage;
  version: number;
  onChanged: (version: number) => void;
}) {
  const t = profileCopy[language];
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(
    () => (selectedImage ? URL.createObjectURL(selectedImage) : null),
    [selectedImage],
  );

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const clearSelection = () => {
    setSelectedImage(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.currentTarget.files?.[0] ?? null;
    if (!image) return;
    if (!PROFILE_IMAGE_TYPES.includes(image.type)) {
      toast.error(t.invalid);
      event.currentTarget.value = "";
      return;
    }
    if (image.size > MAX_PROFILE_IMAGE_BYTES) {
      toast.error(t.tooLarge);
      event.currentTarget.value = "";
      return;
    }
    setSelectedImage(image);
  };

  const saveImage = async () => {
    if (!selectedImage) return;
    const formData = new FormData();
    formData.set("image", selectedImage);
    setBusy(true);
    try {
      const response = await fetch("/api/profile/image", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        version?: number;
      };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return;
      }
      if (!response.ok) throw new Error(payload.error || t.invalid);
      clearSelection();
      setHasImage(true);
      onChanged(payload.version ?? Date.now());
      toast.success(t.saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.invalid);
    } finally {
      setBusy(false);
    }
  };

  const removeImage = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/profile/image", { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        version?: number;
      };
      if (response.status === 401) {
        window.location.replace("/connexion");
        return;
      }
      if (!response.ok) throw new Error(payload.error || t.remove);
      clearSelection();
      setHasImage(false);
      onChanged(payload.version ?? Date.now());
      toast.success(t.removed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.remove);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 min-[390px]:grid-cols-[7rem_minmax(0,1fr)] min-[390px]:items-center">
      <div className="relative mx-auto w-fit min-[390px]:mx-0">
        <ProfileAvatar
          user={user}
          version={version}
          className="size-28 rounded-[2rem] text-2xl shadow-sm"
          onAvailabilityChange={setHasImage}
        />
        {previewUrl && (
          // The local object URL exists only for this preview.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={t.preview}
            className="absolute inset-0 size-28 rounded-[2rem] object-cover"
          />
        )}
        <button
          type="button"
          className="absolute -bottom-2 -end-2 grid size-11 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => inputRef.current?.click()}
          aria-label={t.edit}
        >
          <Camera className="size-4" />
        </button>
      </div>

      <div className="min-w-0">
        <p className="text-center font-semibold min-[390px]:text-start">{user.name}</p>
        <p className="mt-1 text-center text-sm leading-6 text-muted-foreground min-[390px]:text-start">
          {t.hint}
        </p>
        {selectedImage && (
          <p className="mt-2 truncate text-center text-xs font-medium text-primary min-[390px]:text-start">
            {selectedImage.name}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          tabIndex={-1}
          aria-label={t.choose}
          onChange={chooseImage}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2 min-[390px]:justify-start">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus /> {hasImage ? t.change : t.choose}
          </Button>
          {selectedImage ? (
            <>
              <Button
                type="button"
                className="h-11 rounded-xl"
                disabled={busy}
                onClick={() => void saveImage()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Check />}
                {t.save}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 rounded-xl"
                disabled={busy}
                onClick={clearSelection}
                aria-label={t.cancel}
                title={t.cancel}
              >
                <X />
              </Button>
            </>
          ) : hasImage ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => void removeImage()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t.remove}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
