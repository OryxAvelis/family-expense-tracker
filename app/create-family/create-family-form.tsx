"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  Home,
  KeyRound,
  Languages,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";

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

type Language = "fr" | "ar" | "en";

type CreatedFamily = {
  familyCode: string;
  supportRef: string;
  status: "active";
};

const copy = {
  fr: {
    eyebrow: "NOUVEL ESPACE FAMILIAL",
    title: "Créez votre maison numérique.",
    description: "Un espace privé pour les commandes, les services et le budget de votre famille.",
    privateTitle: "Séparé des autres familles",
    privateText: "Vos membres, commandes et soldes restent dans votre foyer.",
    ownerTitle: "Vous restez responsable",
    ownerText: "Le premier compte devient le propriétaire de la famille.",
    codeTitle: "Accès uniquement sur invitation",
    codeText: "Un code familial privé est créé et affiché une seule fois.",
    step: "Configuration initiale",
    formTitle: "Créer une famille",
    formDescription: "Comptez environ une minute. Vous pourrez ajouter le Buyer et les membres ensuite.",
    familyName: "Nom de la famille",
    familyPlaceholder: "Ex. Famille Benali",
    ownerName: "Votre nom",
    ownerPlaceholder: "Ex. Nadia",
    username: "Nom d’utilisateur",
    usernamePlaceholder: "Ex. nadia",
    usernameHint: "Unique seulement dans votre famille.",
    pin: "Code PIN du propriétaire",
    pinPlaceholder: "6 à 12 chiffres",
    confirmPin: "Confirmer le code PIN",
    security: "Le PIN est haché avec Argon2id. DarnaFlow ne peut pas l’afficher.",
    submit: "Créer ma famille",
    creating: "Création sécurisée…",
    back: "Retour à la connexion",
    mismatch: "Les deux codes PIN ne correspondent pas.",
    invalidPin: "Le code PIN doit contenir entre 6 et 12 chiffres.",
    genericError: "La création de la famille a échoué. Réessayez.",
    successEyebrow: "FAMILLE CRÉÉE",
    successTitle: "Votre espace est prêt.",
    successDescription: "Votre famille est créée. Conservez le code ci-dessous avant de vous connecter.",
    familyCode: "Code familial privé",
    supportRef: "Référence d’assistance anonyme",
    copyCode: "Copier le code",
    copyInvite: "Copier le lien d’invitation",
    copied: "Copié",
    oneTime: "Enregistrez ce code maintenant. Il n’est jamais stocké en clair et ne sera pas réaffiché.",
    preparing: "Isolation familiale activée",
    preparingText: "Vous pouvez vous connecter maintenant. Les membres, commandes et portefeuilles de votre famille restent séparés des autres foyers.",
    finish: "Se connecter à ma famille",
  },
  ar: {
    eyebrow: "مساحة عائلية جديدة",
    title: "أنشئ بيتكم الرقمي.",
    description: "مساحة خاصة لطلبات وخدمات وميزانية العائلة.",
    privateTitle: "منفصلة عن باقي العائلات",
    privateText: "يبقى الأعضاء والطلبات والأرصدة داخل عائلتكم فقط.",
    ownerTitle: "أنت المسؤول",
    ownerText: "يصبح الحساب الأول مالك مساحة العائلة.",
    codeTitle: "الدخول بالدعوة فقط",
    codeText: "يُنشأ رمز عائلي خاص ويُعرض مرة واحدة.",
    step: "الإعداد الأولي",
    formTitle: "إنشاء عائلة",
    formDescription: "يستغرق الأمر نحو دقيقة، ويمكنك إضافة المشتري والأعضاء لاحقاً.",
    familyName: "اسم العائلة",
    familyPlaceholder: "مثال: عائلة بنعلي",
    ownerName: "اسمك",
    ownerPlaceholder: "مثال: نادية",
    username: "اسم المستخدم",
    usernamePlaceholder: "مثال: nadia",
    usernameHint: "فريد داخل عائلتك فقط.",
    pin: "رمز PIN للمالك",
    pinPlaceholder: "من 6 إلى 12 رقماً",
    confirmPin: "تأكيد رمز PIN",
    security: "يُشفّر PIN بواسطة Argon2id ولا يمكن لـ DarnaFlow عرضه.",
    submit: "إنشاء عائلتي",
    creating: "جارٍ الإنشاء الآمن…",
    back: "العودة إلى تسجيل الدخول",
    mismatch: "رمزا PIN غير متطابقين.",
    invalidPin: "يجب أن يتكوّن PIN من 6 إلى 12 رقماً.",
    genericError: "تعذر إنشاء العائلة. حاول مرة أخرى.",
    successEyebrow: "تم إنشاء العائلة",
    successTitle: "مساحتكم جاهزة.",
    successDescription: "تم إنشاء عائلتكم. احفظ الرمز أدناه قبل تسجيل الدخول.",
    familyCode: "رمز العائلة الخاص",
    supportRef: "مرجع الدعم المجهول",
    copyCode: "نسخ الرمز",
    copyInvite: "نسخ رابط الدعوة",
    copied: "تم النسخ",
    oneTime: "احفظ هذا الرمز الآن. لا يتم تخزينه بشكل مكشوف ولن يظهر مرة أخرى.",
    preparing: "تم تفعيل عزل العائلة",
    preparingText: "يمكنك تسجيل الدخول الآن. يبقى أعضاء عائلتك وطلباتها ومحافظها منفصلين عن باقي العائلات.",
    finish: "تسجيل الدخول إلى عائلتي",
  },
  en: {
    eyebrow: "NEW FAMILY WORKSPACE",
    title: "Create your digital home.",
    description: "One private place for your family’s orders, services, and budget.",
    privateTitle: "Separated from every family",
    privateText: "Your members, orders, and balances stay inside your household.",
    ownerTitle: "You remain in control",
    ownerText: "The first account becomes the Family Owner.",
    codeTitle: "Invitation-only access",
    codeText: "A private family code is created and shown once.",
    step: "Initial setup",
    formTitle: "Create a family",
    formDescription: "This takes about one minute. You can add the Buyer and Members afterward.",
    familyName: "Family name",
    familyPlaceholder: "Example: Benali Family",
    ownerName: "Your name",
    ownerPlaceholder: "Example: Nadia",
    username: "Username",
    usernamePlaceholder: "Example: nadia",
    usernameHint: "It only needs to be unique inside your family.",
    pin: "Owner PIN",
    pinPlaceholder: "6 to 12 digits",
    confirmPin: "Confirm PIN",
    security: "The PIN is protected with Argon2id. DarnaFlow cannot display it.",
    submit: "Create my family",
    creating: "Creating securely…",
    back: "Back to sign in",
    mismatch: "The two PINs do not match.",
    invalidPin: "The PIN must contain between 6 and 12 digits.",
    genericError: "The family could not be created. Try again.",
    successEyebrow: "FAMILY CREATED",
    successTitle: "Your workspace is ready.",
    successDescription: "Your family has been created. Save the code below before signing in.",
    familyCode: "Private family code",
    supportRef: "Anonymous support reference",
    copyCode: "Copy code",
    copyInvite: "Copy invitation link",
    copied: "Copied",
    oneTime: "Save this code now. It is never stored in plain text and will not be shown again.",
    preparing: "Family isolation is active",
    preparingText: "You can sign in now. Your family’s members, orders, and wallets stay separated from every other household.",
    finish: "Sign in to my family",
  },
} as const;

const languageNames: Record<Language, string> = {
  fr: "Français",
  ar: "العربية",
  en: "English",
};

function usernameFromName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 40);
}

export function CreateFamilyForm() {
  const [language, setLanguage] = useState<Language>("fr");
  const [familyName, setFamilyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreatedFamily | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | "ref" | null>(null);
  const requestId = useRef("");
  const t = copy[language];
  const direction = language === "ar" ? "rtl" : "ltr";
  const generatedUsername = usernameFromName(ownerName);
  const effectiveUsername = generatedUsername;
  const numericPin = (value: string) => value.replace(/\D/g, "").slice(0, 12);
  const safetyFeatures = [
    { Icon: ShieldCheck, title: t.privateTitle, text: t.privateText },
    { Icon: Home, title: t.ownerTitle, text: t.ownerText },
    { Icon: KeyRound, title: t.codeTitle, text: t.codeText },
  ];

  const readiness = useMemo(() => {
    const fields = [familyName.trim().length >= 2, ownerName.trim().length >= 2, effectiveUsername.length >= 2];
    const pinReady = /^\d{6,12}$/.test(pin) && pin === confirmPin;
    return { complete: fields.every(Boolean) && pinReady, completed: fields.filter(Boolean).length + Number(pinReady) };
  }, [confirmPin, effectiveUsername, familyName, ownerName, pin]);

  const updateOwnerName = (value: string) => {
    setOwnerName(value);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6,12}$/.test(pin)) {
      setError(t.invalidPin);
      return;
    }
    if (pin !== confirmPin) {
      setError(t.mismatch);
      return;
    }

    setBusy(true);
    if (!requestId.current) requestId.current = crypto.randomUUID();

    try {
      const response = await fetch("/api/onboarding/families", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": requestId.current,
        },
        body: JSON.stringify({ familyName, ownerName, username: effectiveUsername, pin, locale: language }),
      });
      const payload = (await response.json()) as Partial<CreatedFamily> & {
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.familyCode || !payload.supportRef || payload.status !== "active") {
        throw new Error(payload.error || t.genericError);
      }
      setCreated({
        familyCode: payload.familyCode,
        supportRef: payload.supportRef,
        status: payload.status,
      });
      setPin("");
      setConfirmPin("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const copyValue = async (kind: "code" | "link" | "ref", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1800);
    } catch {
      setCopied(null);
    }
  };

  if (created) {
    return (
      <main dir={direction} className="relative min-h-[100svh] overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12">
        <div aria-hidden="true" className="login-ambient login-ambient-one" />
        <div aria-hidden="true" className="login-ambient login-ambient-two" />
        <section className="login-card-enter relative mx-auto w-full max-w-3xl overflow-hidden rounded-[2rem] border border-border/80 bg-card/95 p-5 shadow-2xl shadow-primary/10 backdrop-blur-xl sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-primary">{t.successEyebrow}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t.successTitle}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t.successDescription}</p>
            </div>
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <CheckCircle2 className="size-7" />
            </span>
          </div>

          <div className="mt-7 rounded-3xl border border-primary/25 bg-primary/5 p-4 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <KeyRound className="size-4" /> {t.familyCode}
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <code dir="ltr" className="text-2xl font-bold tracking-[0.16em] sm:text-3xl">{created.familyCode}</code>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void copyValue("code", created.familyCode)}>
                {copied === "code" ? <Check /> : <Copy />} {copied === "code" ? t.copied : t.copyCode}
              </Button>
            </div>
            <p className="mt-4 rounded-2xl bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">{t.oneTime}</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => void copyValue("ref", created.supportRef)} className="rounded-2xl border border-border bg-muted/35 p-4 text-start transition-colors hover:bg-muted/60">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Fingerprint className="size-4" /> {t.supportRef}</span>
              <strong dir="ltr" className="mt-2 block tracking-[0.12em]">{created.supportRef}</strong>
            </button>
            <button
              type="button"
              onClick={() => void copyValue("link", `${window.location.origin}/connexion?familyCode=${encodeURIComponent(created.familyCode)}&mode=signup`)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/35 p-4 text-start font-semibold transition-colors hover:bg-muted/60"
            >
              <span className="flex items-center gap-2"><UsersRound className="size-5 text-primary" /> {copied === "link" ? t.copied : t.copyInvite}</span>
              {copied === "link" ? <Check className="size-5 text-primary" /> : <Copy className="size-5 text-muted-foreground" />}
            </button>
          </div>

          <div className="mt-5 flex gap-3 rounded-2xl border border-primary/25 bg-primary/8 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <strong className="text-sm">{t.preparing}</strong>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.preparingText}</p>
            </div>
          </div>

          <Button asChild size="lg" className="mt-7 h-12 w-full rounded-2xl text-base">
            <Link href={`/connexion?familyCode=${encodeURIComponent(created.familyCode)}`}>{t.finish} <ArrowRight /></Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main dir={direction} className="relative min-h-[100svh] overflow-hidden bg-background px-3 py-3 text-foreground sm:px-6 sm:py-8">
      <div aria-hidden="true" className="login-ambient login-ambient-one" />
      <div aria-hidden="true" className="login-ambient login-ambient-two" />

      <div className="login-card-enter relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/75 bg-card/95 shadow-2xl shadow-primary/10 backdrop-blur-xl lg:min-h-[45rem] lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="relative overflow-hidden bg-sidebar p-6 text-sidebar-foreground sm:p-9 lg:p-11">
          <div aria-hidden="true" className="login-grid absolute inset-0 opacity-50" />
          <div aria-hidden="true" className="absolute -end-20 -top-20 size-64 rounded-full bg-sidebar-primary/12 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <Link href="/connexion" className="inline-flex items-center gap-2 text-sm font-semibold text-sidebar-foreground/75 hover:text-sidebar-foreground">
                <ArrowLeft className="size-4" /> {t.back}
              </Link>
              <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
                <SelectTrigger aria-label="Language" className="h-10 w-36 rounded-xl border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground">
                  <Languages className="size-4" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(languageNames) as Language[]).map((item) => <SelectItem key={item} value={item}>{languageNames[item]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-12 lg:mt-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/65 px-3 py-1.5 text-xs font-bold tracking-[0.12em] text-sidebar-primary">
                <Sparkles className="size-4" /> {t.eyebrow}
              </div>
              <h1 className="mt-5 max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">{t.title}</h1>
              <p className="mt-5 max-w-md text-base leading-7 text-sidebar-foreground/68">{t.description}</p>
            </div>

            <div className="mt-9 space-y-4 lg:mt-auto">
              {safetyFeatures.map(({ Icon, title, text }) => (
                <div key={title} className="flex gap-3 rounded-2xl border border-sidebar-border/75 bg-sidebar-accent/45 p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary"><Icon className="size-5" /></span>
                  <div><strong className="text-sm">{title}</strong><p className="mt-1 text-xs leading-5 text-sidebar-foreground/62">{text}</p></div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="p-5 sm:p-9 lg:p-11">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t.step}</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t.formTitle}</h2>
            </div>
            <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><UsersRound className="size-7" /></div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.formDescription}</p>

          <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${Math.max(8, readiness.completed * 25)}%` }} />
          </div>

          <form className="mt-7 space-y-5" onSubmit={(event) => void submit(event)}>
            <div className="space-y-2">
              <Label htmlFor="family-name">{t.familyName}</Label>
              <div className="relative">
                <Home className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input id="family-name" required minLength={2} maxLength={80} autoComplete="organization" value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder={t.familyPlaceholder} className="h-12 rounded-2xl bg-background/70 ps-12 text-base" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="owner-name">{t.ownerName}</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="owner-name" required minLength={2} maxLength={80} autoComplete="name" value={ownerName} onChange={(event) => updateOwnerName(event.target.value)} placeholder={t.ownerPlaceholder} className="h-12 rounded-2xl bg-background/70 ps-12 text-base" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-username-preview">{t.username}</Label>
                <div id="owner-username-preview" role="status" aria-live="polite" className="flex h-12 items-center rounded-2xl border border-input bg-muted/45 px-3 text-base font-semibold">
                  {effectiveUsername || <span className="font-normal text-muted-foreground">{t.usernamePlaceholder}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{t.usernameHint}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="owner-pin">{t.pin}</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="owner-pin" type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" required value={pin} onChange={(event) => setPin(numericPin(event.target.value))} placeholder={t.pinPlaceholder} className="h-12 rounded-2xl bg-background/70 px-12 text-base tracking-[0.2em]" />
                  <Button type="button" size="icon-sm" variant="ghost" className="absolute end-1.5 top-1/2 size-9 -translate-y-1/2 rounded-xl text-muted-foreground" onClick={() => setShowPin((current) => !current)} aria-label={showPin ? "Hide PIN" : "Show PIN"}>
                    {showPin ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-owner-pin">{t.confirmPin}</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="confirm-owner-pin" type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="off" required value={confirmPin} onChange={(event) => setConfirmPin(numericPin(event.target.value))} className="h-12 rounded-2xl bg-background/70 ps-12 text-base tracking-[0.2em]" />
                  {confirmPin && pin === confirmPin && <CheckCircle2 className="pointer-events-none absolute end-4 top-1/2 size-5 -translate-y-1/2 text-primary" />}
                </div>
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-2xl bg-muted/50 px-4 py-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> {t.security}</p>

            {error && <p role="alert" className="rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}

            <Button type="submit" size="lg" className="h-12 w-full rounded-2xl text-base shadow-lg shadow-primary/15" disabled={busy || !readiness.complete}>
              {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {busy ? t.creating : t.submit}
              {!busy && <ArrowRight />}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
