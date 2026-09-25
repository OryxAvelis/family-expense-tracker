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
  Moon,
  Sun,
  UserRoundPlus,
  Volume2,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFamilyTheme } from "@/hooks/use-family-theme";
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
    hint: "Choisissez votre nom ou votre photo.",
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
    lightTheme: "Thème clair",
    darkTheme: "Thème sombre",
    language: "Langue",
    keypad: "Clavier numérique",
  },
  ar: {
    darijaTitle: "شكون نتا؟",
    title: "شكون كيستعمل التليفون؟",
    hint: "اختار سميتك ولا صورتك.",
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
    lightTheme: "الوضع الفاتح",
    darkTheme: "الوضع الداكن",
    language: "اللغة",
    keypad: "لوحة الأرقام",
  },
  en: {
    darijaTitle: "شكون نتا؟",
    title: "Who is using this phone?",
    hint: "Choose your name or photo.",
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
    lightTheme: "Light theme",
    darkTheme: "Dark theme",
    language: "Language",
    keypad: "Numeric keypad",
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
    <span className="relative grid size-full place-items-center overflow-hidden rounded-[inherit] bg-primary/10 text-xl font-extrabold text-primary">
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
  const { theme, toggleTheme } = useFamilyTheme();

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
          ? "اختار سميتك ولا صورتك."
          : language === "en"
            ? "Choose your name or photo."
            : "Choisissez votre nom ou votre photo.",
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

  return (
    <main dir={direction} className="min-h-[100svh] overflow-x-clip bg-background text-foreground">
      <div className="mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-3 max-[419px]:w-full">
            <span className="relative size-11 shrink-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:size-12">
              <Image src="/icons/icon-192.png" alt="" fill sizes="48px" className="object-cover" priority />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold tracking-[-0.03em] sm:text-xl">DarnaFlow</p>
              <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{directory?.familyName ?? "الدار تجمعنا"}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 max-[419px]:w-full max-[419px]:justify-end">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-11 rounded-2xl bg-card"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? t.lightTheme : t.darkTheme}
              title={theme === "dark" ? t.lightTheme : t.darkTheme}
            >
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            <Select value={language} onValueChange={(value) => setLanguage(value as EntranceLanguage)}>
              <SelectTrigger className="h-11 w-36 rounded-2xl bg-card px-3" aria-label={t.language}>
                <Languages className="size-5 text-primary" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {(Object.keys(languageLabels) as EntranceLanguage[]).map((key) => (
                  <SelectItem key={key} value={key}>{languageLabels[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {loading ? (
          <div className="m-auto grid place-items-center gap-4 rounded-3xl border border-border bg-card px-8 py-12 text-center shadow-sm">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="font-semibold">{t.loading}</p>
          </div>
        ) : !directory ? (
          <div className="m-auto max-w-md rounded-3xl border border-destructive/25 bg-card p-7 text-center shadow-sm">
            <AlertCircle className="mx-auto size-10 text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">{t.openError}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button asChild className="mt-6 h-12 rounded-2xl px-6">
              <Link href="/create-family"><UserRoundPlus /> {t.createFamily}</Link>
            </Button>
          </div>
        ) : (
          <div className="my-auto grid gap-4 py-5 sm:py-7 lg:grid-cols-[1.04fr_0.96fr] lg:items-start lg:gap-6">
            <section
              aria-labelledby="family-profile-heading"
              className={cn(
                "rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6",
                selected && "hidden lg:block",
              )}
            >
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">DarnaFlow</p>
                <h1 id="family-profile-heading" className="mt-1 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">{t.title}</h1>
                <p className="mt-1 text-sm text-muted-foreground sm:text-base">{t.hint}</p>
              </div>

              {directory.members.length ? (
                <div className="mt-5 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:gap-3">
                  {directory.members.map((member) => {
                    const active = selected?.id === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => chooseMember(member)}
                        className={cn(
                          "relative flex min-h-20 min-w-0 items-center gap-3 rounded-2xl border bg-background/50 p-3 text-start shadow-xs transition-colors hover:border-primary/45 hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          active && "border-primary bg-primary/10 ring-1 ring-primary/20",
                        )}
                        aria-pressed={active}
                      >
                        <span className="size-13 shrink-0 rounded-2xl sm:size-14">
                          <MemberPortrait member={member} familyCode={familyCode} />
                        </span>
                        <span title={member.name} className="min-w-0 flex-1 break-words text-base font-bold leading-tight sm:text-lg">{member.name}</span>
                        {active && (
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                            <Check className="size-4" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/35 p-7 text-center">
                  <UserRoundPlus className="mx-auto size-10 text-primary" />
                  <p className="mt-3 font-bold">{t.empty}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.ownerHelp}</p>
                </div>
              )}
            </section>

            <section
              ref={pinPanelRef}
              aria-labelledby="family-pin-heading"
              className={cn(
                "rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:scrollbar-thin lg:scrollbar-gutter-stable",
                selected ? "ring-1 ring-primary/15" : "hidden lg:block",
              )}
            >
              <div className="flex min-h-full flex-col">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {selected ? (
                      <span className="size-13 shrink-0 rounded-2xl sm:size-14">
                        <MemberPortrait member={selected} familyCode={familyCode} />
                      </span>
                    ) : (
                      <span className="grid size-13 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:size-14">
                        <HouseHeart className="size-7" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h2 id="family-pin-heading" className="break-words text-xl font-extrabold tracking-[-0.025em] sm:text-2xl">{selected?.name ?? t.pinTitle}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">{selected ? t.pinActionHint : t.choose}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <Button type="button" size="icon" variant="outline" className="size-11 rounded-2xl" onClick={speak} aria-label={t.listen} title={t.listen}>
                      <Volume2 className="size-5 text-primary" />
                    </Button>
                    {selected && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-11 rounded-2xl px-3 text-sm"
                        onClick={() => { setSelected(null); setPin(""); setError(""); setRecoveryOpen(false); }}
                      >
                        {direction === "rtl" ? <ArrowRight className="size-4" /> : <ArrowLeft className="size-4" />}
                        <span className="hidden sm:inline">{t.back}</span>
                        <span className="sm:hidden">{language === "ar" ? "بدل" : language === "en" ? "Change" : "Changer"}</span>
                      </Button>
                    )}
                  </div>
                </div>

                <form className="mt-5 flex flex-1 flex-col" onSubmit={(event) => void submit(event)}>
                  <div className="space-y-2">
                    <Label htmlFor="family-pin-input" className="block text-base font-bold">
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
                      className="h-14 rounded-2xl bg-background px-4 text-center text-2xl font-black tracking-[0.35em] focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                    <p id="family-pin-help" className="text-sm leading-5 text-muted-foreground">{t.pinHint}</p>
                    <p id="family-pin-count" className="sr-only" aria-live="polite">{t.pinCount(pin.length)}</p>
                  </div>

                  <div aria-label={t.keypad} className="mx-auto mt-4 grid w-full max-w-sm grid-cols-3 gap-2">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        disabled={!selected || busy}
                        onClick={() => pressDigit(digit)}
                        className="h-13 rounded-2xl border border-border bg-secondary text-2xl font-extrabold text-secondary-foreground shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45 sm:h-14"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={speak}
                      className="grid h-13 place-items-center rounded-2xl border border-border bg-background text-primary shadow-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45 sm:h-14"
                      aria-label={t.listen}
                    >
                      <Volume2 className="size-6" />
                    </button>
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={() => pressDigit("0")}
                      className="h-13 rounded-2xl border border-border bg-secondary text-2xl font-extrabold text-secondary-foreground shadow-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45 sm:h-14"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      disabled={!selected || busy || !pin}
                      onClick={removeDigit}
                      className="grid h-13 place-items-center rounded-2xl border border-border bg-background text-foreground shadow-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-45 sm:h-14"
                      aria-label={t.deleteDigit}
                    >
                      <Delete className="size-6" />
                    </button>
                  </div>

                  {error && (
                    <p id="family-pin-error" role="alert" aria-live="assertive" className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-center text-sm font-semibold text-destructive">
                      <AlertCircle className="size-5 shrink-0" /> {error}
                    </p>
                  )}

                  <Button type="submit" disabled={!selected || busy} className="mt-4 h-13 w-full rounded-2xl text-base font-bold shadow-sm sm:h-14">
                    {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
                    {t.enter}
                    {direction === "rtl" ? <ArrowLeft /> : <ArrowRight />}
                  </Button>

                  <button
                    type="button"
                    aria-expanded={recoveryOpen}
                    aria-controls="family-pin-recovery"
                    onClick={() => setRecoveryOpen((current) => !current)}
                    className="mx-auto mt-2 min-h-11 rounded-xl px-4 text-sm font-semibold text-primary underline decoration-primary/35 underline-offset-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {recoveryOpen ? t.closeRecovery : t.forgot}
                  </button>
                  {recoveryOpen && (
                    <div id="family-pin-recovery" className="mt-2 rounded-2xl border border-border bg-muted/45 p-4 text-sm leading-6 text-muted-foreground">
                      <p className="font-bold text-foreground">{t.recoveryTitle}</p>
                      <p className="mt-1">{t.recoveryMember}</p>
                      <p className="mt-2">{t.recoveryAdmin}</p>
                    </div>
                  )}
                </form>
              </div>
            </section>
          </div>
        )}

        <footer className="mt-auto flex items-center justify-center pb-1 pt-3 text-center text-xs font-semibold text-muted-foreground">
          <Link href="/create-family" className="min-h-11 rounded-xl px-3 py-3 hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t.createFamily}</Link>
        </footer>
      </div>
    </main>
  );
}
