"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Delete,
  HouseHeart,
  Languages,
  Loader2,
  LockKeyhole,
  UserRoundPlus,
  Volume2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isSupportedFamilyPin,
  MAX_FAMILY_PIN_LENGTH,
  normalizeFamilyPin,
  resolveFamilyLoginFailure,
} from "@/lib/family-pin";
import { cn } from "@/lib/utils";

type EntranceLanguage = "fr" | "ar" | "en";

type FamilyMember = {
  id: number;
  name: string;
  initials: string;
};

type FamilyDirectory = {
  familyName: string;
  locale: EntranceLanguage;
  members: FamilyMember[];
};

const entranceCopy = {
  fr: {
    darijaTitle: "شكون نتا؟",
    title: "Qui utilise le téléphone ?",
    hint: "Touchez votre photo.",
    pinTitle: "Entrez votre code",
    pinActionHint: "Écrivez le code ou utilisez le clavier.",
    pinHint: "4 chiffres pour un ancien compte, ou 6 à 12 chiffres.",
    pinLabel: "Code PIN",
    pinCount: (count: number) => `${count} chiffre${count > 1 ? "s" : ""} saisi${count > 1 ? "s" : ""}`,
    incompletePin: "Entrez 4 chiffres pour un ancien compte, ou 6 à 12 chiffres.",
    incorrectPin: "Code incorrect. Vérifiez-le et réessayez.",
    rateLimited: "Trop de tentatives. Attendez quelques minutes avant de réessayer.",
    accountPending: "Ce compte attend encore l’approbation du responsable de la famille.",
    familyProvisioning: "Cette famille est encore en préparation. Réessayez plus tard.",
    familySuspended: "Cet espace familial est temporairement suspendu.",
    serverFailure: "Connexion impossible pour le moment. Vérifiez votre connexion et réessayez.",
    forgot: "Code oublié ?",
    recoveryTitle: "Vous avez oublié votre code ?",
    recoveryMember: "Demandez au responsable de votre famille de vérifier que votre compte est actif. Votre code reste secret et ne peut jamais être affiché.",
    recoveryAdmin: "Le responsable peut vérifier le compte, mais DarnaFlow ne permet pas encore de voir ou de réinitialiser un code PIN.",
    closeRecovery: "Fermer l’aide",
    deleteDigit: "Effacer un chiffre",
    listen: "Écouter",
    enter: "Entrer dans la famille",
    choose: "Choisissez d’abord votre photo.",
    empty: "Aucune personne n’a encore été ajoutée.",
    ownerHelp: "Le responsable de la famille peut ajouter la première personne.",
    createFamily: "Créer une autre famille",
    loading: "Ouverture de la famille…",
    openError: "Impossible d’ouvrir cette famille.",
    back: "Changer de personne",
  },
  ar: {
    darijaTitle: "شكون نتا؟",
    title: "شكون كيستعمل التليفون؟",
    hint: "ضغط على صورتك.",
    pinTitle: "دخل الرقم ديالك",
    pinActionHint: "كتب الرمز أو استعمل لوحة الأرقام.",
    pinHint: "4 أرقام للحساب القديم، أو من 6 حتى 12 رقم.",
    pinLabel: "الرمز السري PIN",
    pinCount: (count: number) => `دخلتي ${count} رقم`,
    incompletePin: "دخل 4 أرقام للحساب القديم، أو من 6 حتى 12 رقم.",
    incorrectPin: "الرمز غير صحيح. تأكد منو وعاود جرب.",
    rateLimited: "كاينين محاولات بزاف. تسنى شوية وعاود جرب.",
    accountPending: "هاد الحساب مازال كيتسنى موافقة مسؤول العائلة.",
    familyProvisioning: "هاد الدار مازالت كتوجد. عاود جرب من بعد.",
    familySuspended: "هاد الفضاء العائلي موقوف مؤقتاً.",
    serverFailure: "ما قدرناش ندخلوك دابا. تأكد من الإنترنت وعاود جرب.",
    forgot: "نسيتي الرمز؟",
    recoveryTitle: "نسيتي الرمز ديالك؟",
    recoveryMember: "طلب من مسؤول العائلة يتأكد بلي الحساب ديالك خدام. الرمز ديالك سري وما يقدر حتى واحد يشوفو.",
    recoveryAdmin: "مسؤول العائلة يقدر يتأكد من الحساب، ولكن DarnaFlow ما كيمكنش دابا من مشاهدة أو تغيير رمز PIN.",
    closeRecovery: "سد المساعدة",
    deleteDigit: "مسح رقم",
    listen: "سمعني",
    enter: "دخل للدار",
    choose: "اختار صورتك الأول.",
    empty: "ما تزاد حتى واحد دابا.",
    ownerHelp: "مول الدار يقدر يزيد أول شخص.",
    createFamily: "دير دار جديدة",
    loading: "كنفتحو الدار…",
    openError: "ما قدرناش نفتحو هاد الدار.",
    back: "بدل الشخص",
  },
  en: {
    darijaTitle: "شكون نتا؟",
    title: "Who is using this phone?",
    hint: "Tap your photo.",
    pinTitle: "Enter your code",
    pinActionHint: "Type your code or use the keypad.",
    pinHint: "4 digits for a legacy account, or 6 to 12 digits.",
    pinLabel: "PIN code",
    pinCount: (count: number) => `${count} digit${count === 1 ? "" : "s"} entered`,
    incompletePin: "Enter 4 digits for a legacy account, or 6 to 12 digits.",
    incorrectPin: "Incorrect code. Check it and try again.",
    rateLimited: "Too many attempts. Wait a few minutes before trying again.",
    accountPending: "This account is still waiting for the family administrator’s approval.",
    familyProvisioning: "This family is still being prepared. Try again later.",
    familySuspended: "This family space is temporarily suspended.",
    serverFailure: "Sign-in is unavailable right now. Check your connection and try again.",
    forgot: "Forgot your code?",
    recoveryTitle: "Forgot your code?",
    recoveryMember: "Ask your family administrator to check that your account is active. Your code stays private and can never be displayed.",
    recoveryAdmin: "The administrator can check the account, but DarnaFlow does not yet allow anyone to view or reset a PIN.",
    closeRecovery: "Close help",
    deleteDigit: "Delete one digit",
    listen: "Listen",
    enter: "Enter the family",
    choose: "Choose your photo first.",
    empty: "Nobody has been added yet.",
    ownerHelp: "The family owner can add the first person.",
    createFamily: "Create another family",
    loading: "Opening the family…",
    openError: "This family could not be opened.",
    back: "Choose someone else",
  },
} as const;

const languageLabels: Record<EntranceLanguage, string> = {
  fr: "Français",
  ar: "العربية",
  en: "English",
};

function MemberPortrait({
  member,
  familyCode,
}: {
  member: FamilyMember;
  familyCode?: string;
}) {
  const source = useMemo(() => {
    const parameters = new URLSearchParams({ userId: String(member.id) });
    if (familyCode) parameters.set("familyCode", familyCode);
    return `/api/auth/family/avatar?${parameters.toString()}`;
  }, [familyCode, member.id]);

  return (
    <span className="relative grid size-full place-items-center overflow-hidden rounded-[inherit] bg-[#dff3ed] text-3xl font-extrabold text-[#006a52]">
      <span aria-hidden="true">{member.initials}</span>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${JSON.stringify(source)})` }}
      />
    </span>
  );
}

export function FamilyEntrance({
  familyCode,
  returnTo,
}: {
  familyCode?: string;
  returnTo?: string;
}) {
  const [directory, setDirectory] = useState<FamilyDirectory | null>(null);
  const [language, setLanguage] = useState<EntranceLanguage>("fr");
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const pinPanelRef = useRef<HTMLDivElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const t = entranceCopy[language];
  const direction = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    let cancelled = false;
    const loadDirectory = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/auth/family", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ familyCode }),
          cache: "no-store",
        });
        const payload = (await response.json()) as FamilyDirectory & { error?: string };
        if (!response.ok) throw new Error(payload.error || entranceCopy.fr.openError);
        if (!cancelled) {
          setDirectory(payload);
          if (payload.locale === "fr" || payload.locale === "ar" || payload.locale === "en") {
            setLanguage(payload.locale);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : entranceCopy.fr.openError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadDirectory();
    return () => {
      cancelled = true;
    };
  }, [familyCode]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const chooseMember = (member: FamilyMember) => {
    setSelected(member);
    setPin("");
    setError("");
    setRecoveryOpen(false);
    window.setTimeout(() => {
      pinPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      pinInputRef.current?.focus({ preventScroll: true });
    }, 80);
  };

  const pressDigit = (digit: string) => {
    if (busy || pin.length >= MAX_FAMILY_PIN_LENGTH) return;
    setError("");
    setPin((current) => `${current}${digit}`);
  };

  const removeDigit = () => {
    if (busy) return;
    setError("");
    setPin((current) => current.slice(0, -1));
  };

  const speak = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(
      selected
        ? language === "ar"
          ? `${selected.name}. دخل الرقم ديالك.`
          : language === "en"
            ? `${selected.name}. Enter your personal code.`
            : `${selected.name}. Entrez votre code personnel.`
        : language === "ar"
          ? "اختار صورتك."
          : language === "en"
            ? "Choose your photo."
            : "Touchez votre photo.",
    );
    message.lang = language === "ar" ? "ar-MA" : language === "en" ? "en-GB" : "fr-FR";
    window.speechSynthesis.speak(message);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!selected) {
      setError(t.choose);
      return;
    }
    if (!isSupportedFamilyPin(pin)) {
      setError(t.incompletePin);
      pinInputRef.current?.focus();
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId: selected.id,
          password: pin,
          familyCode,
          returnTo,
        }),
      });
      const payload = (await response.json()) as { code?: string; error?: string; route?: string };
      if (!response.ok) {
        setError(t[resolveFamilyLoginFailure(payload.code, response.status)]);
        setPin("");
        pinInputRef.current?.focus();
        return;
      }
      if (!payload.route) {
        setError(t.serverFailure);
        setPin("");
        pinInputRef.current?.focus();
        return;
      }
      window.location.assign(payload.route);
    } catch {
      setError(t.serverFailure);
      setPin("");
      pinInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const pinSlots = Math.max(4, pin.length);

  return (
    <main dir={direction} className="relative min-h-[100svh] overflow-x-clip bg-[#fffdf8] text-[#0a2b23]">
      <Image
        src="/assets/family-entry-decoration.png"
        alt=""
        width={1536}
        height={512}
        priority
        className="pointer-events-none absolute inset-x-0 top-0 h-56 w-full object-cover opacity-70 sm:h-72"
      />
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col px-4 py-5 sm:px-7 sm:py-7 lg:px-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-[#fffdf8]/90 pe-4 shadow-sm">
            <span className="relative size-12 shrink-0 overflow-hidden rounded-2xl shadow-sm sm:size-14">
              <Image src="/assets/darnaflow-mark.png" alt="" fill sizes="56px" className="object-cover" priority />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-extrabold tracking-[-0.03em] text-[#064c3d] sm:text-2xl">DarnaFlow</p>
              <p className="truncate text-xs font-semibold text-[#df692c] sm:text-sm">{directory?.familyName ?? "الدار تجمعنا"}</p>
            </div>
          </div>

          <label className="flex h-12 items-center gap-2 rounded-2xl border border-[#cce3dc] bg-[#fffdf8]/95 px-3 text-sm font-semibold shadow-sm">
            <Languages className="size-5 text-[#008d70]" />
            <span className="sr-only">Language</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as EntranceLanguage)}
              className="max-w-24 bg-transparent outline-none"
            >
              {(Object.keys(languageLabels) as EntranceLanguage[]).map((key) => (
                <option key={key} value={key}>{languageLabels[key]}</option>
              ))}
            </select>
          </label>
        </header>

        {loading ? (
          <div className="m-auto grid place-items-center gap-4 rounded-[2rem] border border-[#d8e8e2] bg-white/95 px-8 py-12 text-center shadow-xl shadow-[#064c3d]/5">
            <Loader2 className="size-10 animate-spin text-[#008d70]" />
            <p className="font-semibold">{t.loading}</p>
          </div>
        ) : !directory ? (
          <div className="m-auto max-w-md rounded-[2rem] border border-[#f4c8c8] bg-white p-7 text-center shadow-xl shadow-[#7b1d1d]/5">
            <AlertCircle className="mx-auto size-10 text-[#c73e3e]" />
            <h1 className="mt-4 text-2xl font-bold">{t.openError}</h1>
            <p className="mt-2 text-sm text-[#5d706b]">{error}</p>
            <Button asChild className="mt-6 h-12 rounded-2xl bg-[#008d70] px-6 hover:bg-[#00775f]">
              <Link href="/create-family"><UserRoundPlus /> {t.createFamily}</Link>
            </Button>
          </div>
        ) : (
          <div className="my-auto grid gap-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-7 lg:py-10">
            <section className={cn(
              "rounded-[2rem] border border-[#d8e8e2] bg-white/95 p-5 shadow-[0_22px_60px_rgba(6,76,61,0.10)] sm:p-7",
              selected && "hidden lg:block",
            )}>
              <div className="text-center">
                <p lang="ar" dir="rtl" className="text-4xl font-black tracking-[-0.045em] text-[#073f34] sm:text-5xl">{t.darijaTitle}</p>
                <h1 className="mt-2 text-xl font-bold sm:text-2xl">{t.title}</h1>
                <p className="mt-2 text-sm text-[#687c76] sm:text-base">{t.hint}</p>
              </div>

              {directory.members.length ? (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
                  {directory.members.map((member, index) => {
                    const active = selected?.id === member.id;
                    const centeredLastCard = directory.members.length % 2 === 1 && index === directory.members.length - 1;
                    const cardColors = ["bg-[#fff0ed]", "bg-[#eaf8f1]", "bg-[#fff7dc]", "bg-[#edf5ff]"];
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => chooseMember(member)}
                        className={cn(
                          "relative min-w-0 rounded-[1.65rem] border-2 p-2 text-center shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#79d8bf]/45 sm:p-3",
                          active ? "border-[#00a67d] bg-[#edfbf6]" : "border-transparent",
                          !active && cardColors[index % cardColors.length],
                          centeredLastCard && "col-span-2 w-[calc(50%-0.375rem)] justify-self-center",
                        )}
                        aria-pressed={active}
                      >
                        <span className="mx-auto block aspect-square w-full max-w-36 rounded-[1.35rem] sm:max-w-44">
                          <MemberPortrait member={member} familyCode={familyCode} />
                        </span>
                        <span className="mt-3 block truncate px-1 text-lg font-extrabold sm:text-xl">{member.name}</span>
                        {active && (
                          <span className="absolute end-2.5 top-2.5 grid size-9 place-items-center rounded-full bg-[#00a67d] text-white shadow-md" aria-hidden="true">
                            <Check className="size-5" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-[1.5rem] border border-dashed border-[#b7d6cd] bg-[#f7fbf9] p-8 text-center">
                  <UserRoundPlus className="mx-auto size-10 text-[#008d70]" />
                  <p className="mt-3 font-bold">{t.empty}</p>
                  <p className="mt-1 text-sm text-[#687c76]">{t.ownerHelp}</p>
                </div>
              )}
            </section>

            <section
              ref={pinPanelRef}
              className={cn(
                "rounded-[2rem] border bg-white/95 p-5 shadow-[0_22px_60px_rgba(6,76,61,0.10)] transition-colors sm:p-7 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:scrollbar-thin lg:scrollbar-gutter-stable",
                selected ? "border-[#9bd7c7]" : "border-[#d8e8e2]",
                !selected && "hidden lg:block",
              )}
            >
              <div className="flex min-h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {selected ? (
                      <span className="size-16 shrink-0 rounded-2xl">
                        <MemberPortrait member={selected} familyCode={familyCode} />
                      </span>
                    ) : (
                      <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#eaf8f1] text-[#008d70]">
                        <HouseHeart className="size-8" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-extrabold sm:text-2xl">{selected?.name ?? t.pinTitle}</h2>
                      <p className="mt-1 text-sm text-[#687c76]">{selected ? t.pinActionHint : t.choose}</p>
                    </div>
                  </div>
                  <Button type="button" size="icon" variant="outline" className="size-12 shrink-0 rounded-2xl border-[#cce3dc]" onClick={speak} aria-label={t.listen} title={t.listen}>
                    <Volume2 className="size-6 text-[#008d70]" />
                  </Button>
                </div>

                <form className="mt-6 flex flex-1 flex-col lg:mt-4" onSubmit={(event) => void submit(event)}>
                  <div className="space-y-2">
                    <Label htmlFor="family-pin-input" className="block text-base font-bold text-[#17342d]">
                      {t.pinLabel}
                    </Label>
                    <Input
                      ref={pinInputRef}
                      id="family-pin-input"
                      name="family-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      autoCapitalize="none"
                      enterKeyHint="go"
                      spellCheck={false}
                      maxLength={MAX_FAMILY_PIN_LENGTH}
                      value={pin}
                      disabled={!selected || busy}
                      aria-describedby={`family-pin-help family-pin-count${error ? " family-pin-error" : ""}`}
                      aria-invalid={Boolean(error)}
                      onChange={(event) => {
                        setError("");
                        setPin(normalizeFamilyPin(event.target.value));
                      }}
                      className="h-14 rounded-2xl border-[#b9d7ce] bg-[#f7fbf9] px-4 text-center text-2xl font-black tracking-[0.35em] text-[#073f34] focus-visible:border-[#008d70] focus-visible:ring-4 focus-visible:ring-[#79d8bf]/35 lg:h-12"
                    />
                    <p id="family-pin-help" className="text-sm leading-5 text-[#5d706b]">{t.pinHint}</p>
                    <p id="family-pin-count" className="sr-only" aria-live="polite">{t.pinCount(pin.length)}</p>
                  </div>

                  <div className="mt-4 flex min-h-8 flex-wrap items-center justify-center gap-2.5 lg:mt-2" aria-hidden="true">
                    {Array.from({ length: pinSlots }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "size-4 rounded-full border-2 sm:size-5",
                          index < pin.length ? "border-[#007b61] bg-[#007b61]" : "border-[#bdd5ce] bg-[#f4f8f6]",
                        )}
                      />
                    ))}
                  </div>

                  <div className="mx-auto mt-4 grid w-full max-w-sm grid-cols-3 gap-2.5 sm:gap-3 lg:mt-2 lg:gap-2">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        disabled={!selected || busy}
                        onClick={() => pressDigit(digit)}
                        className="h-16 rounded-2xl border border-[#cce3dc] bg-[#eaf8f1] text-3xl font-black text-[#073f34] shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-[#dcf4eb] active:translate-y-0 disabled:opacity-45 sm:h-[4.5rem] lg:h-14"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={speak}
                      className="grid h-16 place-items-center rounded-2xl border border-[#cce3dc] bg-[#f7fbf9] text-[#008d70] disabled:opacity-45 sm:h-[4.5rem] lg:h-14"
                      aria-label={t.listen}
                    >
                      <Volume2 className="size-7" />
                    </button>
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={() => pressDigit("0")}
                      className="h-16 rounded-2xl border border-[#cce3dc] bg-[#eaf8f1] text-3xl font-black text-[#073f34] shadow-sm disabled:opacity-45 sm:h-[4.5rem] lg:h-14"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      disabled={!selected || busy || !pin}
                      onClick={removeDigit}
                      className="grid h-16 place-items-center rounded-2xl border border-[#cce3dc] bg-[#f7fbf9] text-[#073f34] disabled:opacity-45 sm:h-[4.5rem] lg:h-14"
                      aria-label={t.deleteDigit}
                    >
                      <Delete className="size-7" />
                    </button>
                  </div>

                  {error && (
                    <p id="family-pin-error" role="alert" aria-live="assertive" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-[#f2bcbc] bg-[#fff1f1] px-4 py-3 text-center text-sm font-semibold text-[#a52626]">
                      <AlertCircle className="size-5 shrink-0" /> {error}
                    </p>
                  )}

                  <button
                    type="button"
                    aria-expanded={recoveryOpen}
                    aria-controls="family-pin-recovery"
                    onClick={() => setRecoveryOpen((current) => !current)}
                    className="mx-auto mt-3 min-h-11 rounded-xl px-4 text-sm font-bold text-[#00775f] underline decoration-[#7bcdb7] underline-offset-4 hover:bg-[#eef8f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#79d8bf]/45"
                  >
                    {recoveryOpen ? t.closeRecovery : t.forgot}
                  </button>
                  {recoveryOpen && (
                    <div id="family-pin-recovery" className="mt-2 rounded-2xl border border-[#cce3dc] bg-[#f5faf8] p-4 text-sm leading-6 text-[#3f5f56]">
                      <p className="font-bold text-[#17342d]">{t.recoveryTitle}</p>
                      <p className="mt-1">{t.recoveryMember}</p>
                      <p className="mt-2">{t.recoveryAdmin}</p>
                    </div>
                  )}

                  <div className="mt-auto pt-5 lg:mt-0 lg:pt-3">
                    <Button
                      type="submit"
                      disabled={!selected || busy}
                      className="h-14 w-full rounded-2xl bg-[#008d70] text-base font-bold text-white shadow-lg shadow-[#008d70]/20 hover:bg-[#00775f] lg:h-12"
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
                      {t.enter}
                      {direction === "rtl" ? <ArrowLeft /> : <ArrowRight />}
                    </Button>
                    {selected && (
                      <button type="button" onClick={() => { setSelected(null); setPin(""); setError(""); setRecoveryOpen(false); }} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[#5d706b] hover:bg-[#eef6f2] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#79d8bf]/45">
                        {direction === "rtl" ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />} {t.back}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </section>
          </div>
        )}

        <footer className="mt-auto flex items-center justify-center pb-2 pt-4 text-center text-xs font-semibold text-[#687c76]">
          <Link href="/create-family" className="rounded-xl px-3 py-2 hover:bg-white/70 hover:text-[#008d70]">{t.createFamily}</Link>
        </footer>
      </div>
    </main>
  );
}
