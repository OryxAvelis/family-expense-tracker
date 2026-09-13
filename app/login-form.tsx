"use client";

import Image from "next/image";
import {
  AlertCircle,
  Apple,
  CheckCircle2,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  LogIn,
  LockKeyhole,
  Milk,
  Moon,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Sun,
  UserPlus,
  UserRound,
  Wheat,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFamilyTheme } from "@/hooks/use-family-theme";

type LoginLanguage = "fr" | "ar" | "en";

const copy = {
  fr: {
    title: "Bienvenue à la maison",
    description: "Connectez-vous ou créez votre accès familial.",
    loginTab: "Connexion",
    signupTab: "Créer un compte",
    username: "Votre nom",
    usernamePlaceholder: "Ex. Mohamed",
    password: "Code PIN à 4 chiffres",
    submit: "Entrer dans mon espace",
    signupTitle: "Rejoindre la famille",
    signupDescription: "Choisissez votre nom et votre propre code PIN.",
    confirmPin: "Confirmer le code PIN",
    signupSubmit: "Créer mon compte",
    pinMismatch: "Les deux codes PIN ne correspondent pas.",
    invalidPin: "Le code PIN doit contenir exactement 4 chiffres.",
    pending: "Votre compte attend l’approbation de Youssef.",
    created: "Compte créé !",
    createdDescription: "Youssef doit maintenant approuver votre accès. Vous pourrez ensuite vous connecter avec ce nom et ce code PIN.",
    backToLogin: "Aller à la connexion",
    nameTaken: "Ce nom est déjà utilisé.",
    invalidName: "Saisissez un nom valide.",
    invalidCredentials: "Nom ou code PIN incorrect.",
    rateLimited: "Trop de tentatives. Réessayez plus tard.",
    error: "Connexion impossible.",
    signupError: "Création du compte impossible.",
    secure: "Votre code reste personnel. Youssef valide chaque nouveau membre.",
    access: "Accès réservé à la famille",
    showPassword: "Afficher le code PIN",
    hidePassword: "Masquer le code PIN",
    light: "Mode clair",
    dark: "Mode sombre",
  },
  ar: {
    title: "مرحبا بكم في البيت",
    description: "سجّل الدخول أو أنشئ حسابك العائلي.",
    loginTab: "تسجيل الدخول",
    signupTab: "إنشاء حساب",
    username: "اسمك",
    usernamePlaceholder: "مثال: Mohamed",
    password: "رمز PIN من 4 أرقام",
    submit: "الدخول إلى فضائي",
    signupTitle: "الانضمام إلى العائلة",
    signupDescription: "اختر اسمك ورمز PIN الخاص بك.",
    confirmPin: "تأكيد رمز PIN",
    signupSubmit: "إنشاء حسابي",
    pinMismatch: "رمزا PIN غير متطابقين.",
    invalidPin: "يجب أن يتكون رمز PIN من 4 أرقام بالضبط.",
    pending: "حسابك ينتظر موافقة يوسف.",
    created: "تم إنشاء الحساب!",
    createdDescription: "يجب على يوسف الموافقة على دخولك. بعد ذلك يمكنك تسجيل الدخول بهذا الاسم ورمز PIN.",
    backToLogin: "الذهاب إلى تسجيل الدخول",
    nameTaken: "هذا الاسم مستخدم بالفعل.",
    invalidName: "أدخل اسماً صالحاً.",
    invalidCredentials: "الاسم أو رمز PIN غير صحيح.",
    rateLimited: "محاولات كثيرة. حاول لاحقاً.",
    error: "تعذر تسجيل الدخول.",
    signupError: "تعذر إنشاء الحساب.",
    secure: "رمزك شخصي، ويوسف يوافق على كل عضو جديد.",
    access: "الدخول مخصص للعائلة",
    showPassword: "إظهار رمز PIN",
    hidePassword: "إخفاء رمز PIN",
    light: "الوضع الفاتح",
    dark: "الوضع الداكن",
  },
  en: {
    title: "Welcome home",
    description: "Sign in or create your family access.",
    loginTab: "Sign in",
    signupTab: "Create account",
    username: "Your name",
    usernamePlaceholder: "Example: Mohamed",
    password: "4-digit PIN",
    submit: "Enter my space",
    signupTitle: "Join the family",
    signupDescription: "Choose your name and your own PIN.",
    confirmPin: "Confirm PIN",
    signupSubmit: "Create my account",
    pinMismatch: "The two PINs do not match.",
    invalidPin: "The PIN must contain exactly 4 digits.",
    pending: "Your account is waiting for Youssef’s approval.",
    created: "Account created!",
    createdDescription: "Youssef now needs to approve your access. You can then sign in with this name and PIN.",
    backToLogin: "Go to sign in",
    nameTaken: "This name is already in use.",
    invalidName: "Enter a valid name.",
    invalidCredentials: "Incorrect name or PIN.",
    rateLimited: "Too many attempts. Try again later.",
    error: "Unable to sign in.",
    signupError: "Unable to create the account.",
    secure: "Your PIN stays personal. Youssef approves each new member.",
    access: "Family access only",
    showPassword: "Show PIN",
    hidePassword: "Hide PIN",
    light: "Light mode",
    dark: "Dark mode",
  },
} as const;

const languageNames: Record<LoginLanguage, string> = {
  fr: "Français",
  ar: "العربية",
  en: "English",
};

export function LoginForm() {
  const [language, setLanguage] = useState<LoginLanguage>("fr");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupPin, setSignupPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdUsername, setCreatedUsername] = useState("");
  const { theme, toggleTheme } = useFamilyTheme();
  const t = copy[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const numericPin = (value: string) => value.replace(/\D/g, "").slice(0, 4);

  const messageForCode = (code: string | undefined, fallback: string) => {
    if (code === "ACCOUNT_PENDING") return t.pending;
    if (code === "INVALID_PIN") return t.invalidPin;
    if (code === "INVALID_NAME") return t.invalidName;
    if (code === "INVALID_CREDENTIALS") return t.invalidCredentials;
    if (code === "NAME_TAKEN") return t.nameTaken;
    if (code === "RATE_LIMITED") return t.rateLimited;
    return fallback;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{4}$/.test(password)) {
      setError(t.invalidPin);
      return;
    }
    setBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { route?: string; error?: string; code?: string };
      if (!response.ok || !payload.route) {
        throw new Error(messageForCode(payload.code, payload.error || t.error));
      }
      window.location.assign(payload.route);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t.error);
      setBusy(false);
    }
  };

  const submitSignup = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{4}$/.test(signupPin)) {
      setError(t.invalidPin);
      return;
    }
    if (signupPin !== confirmPin) {
      setError(t.pinMismatch);
      return;
    }
    setBusy(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: signupName, pin: signupPin }),
      });
      const payload = (await response.json()) as {
        created?: boolean;
        username?: string;
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.created) {
        throw new Error(messageForCode(payload.code, payload.error || t.signupError));
      }
      setCreatedUsername(signupName.trim());
      setUsername(signupName.trim());
      setPassword("");
      setSignupPin("");
      setConfirmPin("");
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : t.signupError);
    } finally {
      setBusy(false);
    }
  };

  const changeMode = (value: string) => {
    setMode(value === "signup" ? "signup" : "login");
    setError("");
    setCreatedUsername("");
    setShowPassword(false);
  };

  return (
    <main className="login-shell relative grid min-h-[100svh] place-items-center overflow-hidden bg-background px-3 py-3 text-foreground sm:px-6 sm:py-6">
      <div aria-hidden="true" className="login-ambient login-ambient-one" />
      <div aria-hidden="true" className="login-ambient login-ambient-two" />

      <div className="login-card-enter relative grid w-full max-w-[58rem] overflow-hidden rounded-[1.6rem] border border-border/90 bg-card shadow-[0_24px_70px_rgba(8,40,31,0.13)] sm:rounded-[2rem] lg:grid-cols-[0.82fr_1.18fr]">
        <section className="relative hidden min-h-[560px] overflow-hidden bg-sidebar p-8 text-sidebar-foreground lg:flex lg:flex-col">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_30%_18%,rgba(85,229,187,0.24),transparent_35%),radial-gradient(circle_at_86%_78%,rgba(255,180,84,0.16),transparent_34%)]" />
          <div aria-hidden="true" className="login-grid absolute inset-0 opacity-30" />

          <div className="relative flex items-center gap-3">
            <span className="relative size-11 shrink-0 overflow-hidden rounded-2xl shadow-lg shadow-black/10">
              <Image src="/icons/icon-192.png" alt="" fill sizes="44px" className="object-cover" priority />
            </span>
            <div>
              <p className="font-semibold">Dépenses famille</p>
              <p className="text-sm text-sidebar-foreground/65">Courses de la maison</p>
            </div>
          </div>

          <div aria-hidden="true" className="relative flex flex-1 items-center justify-center py-6">
            <div className="relative size-72">
              <div className="login-breathe absolute inset-10 rounded-full border border-sidebar-primary/20 bg-sidebar-accent/45 shadow-[0_0_70px_rgba(85,229,187,0.12)]" />
              <div className="login-orbit absolute inset-5 rounded-full border border-dashed border-sidebar-primary/25">
                <span className="absolute left-1/2 top-[-5px] size-2.5 -translate-x-1/2 rounded-full bg-sidebar-primary shadow-[0_0_15px_rgba(85,229,187,0.8)]" />
              </div>
              <div className="absolute inset-0 grid place-items-center">
                <div className="login-float grid size-24 place-items-center rounded-[2rem] border border-white/10 bg-sidebar-primary text-sidebar-primary-foreground shadow-2xl shadow-black/25">
                  <ShoppingBasket className="size-11" strokeWidth={1.8} />
                </div>
              </div>

              <span className="login-float login-delay-one absolute left-3 top-12 grid size-14 place-items-center rounded-2xl border border-white/10 bg-sidebar-accent/90 text-sidebar-primary shadow-xl backdrop-blur-sm">
                <Milk className="size-7" />
              </span>
              <span className="login-float login-delay-two absolute right-1 top-20 grid size-12 place-items-center rounded-2xl border border-white/10 bg-sidebar-accent/90 text-[#ffb454] shadow-xl backdrop-blur-sm">
                <Wheat className="size-6" />
              </span>
              <span className="login-float login-delay-three absolute bottom-9 left-7 grid size-12 place-items-center rounded-2xl border border-white/10 bg-sidebar-accent/90 text-[#ff747c] shadow-xl backdrop-blur-sm">
                <Apple className="size-6" />
              </span>
              <span className="login-float login-delay-four absolute bottom-5 right-8 grid size-14 place-items-center rounded-2xl border border-white/10 bg-sidebar-accent/90 text-sidebar-primary shadow-xl backdrop-blur-sm">
                <ShoppingBag className="size-7" />
              </span>
              <Sparkles className="login-twinkle absolute right-10 top-3 size-5 text-[#ffb454]" />
            </div>
          </div>

          <div className="relative rounded-2xl border border-white/8 bg-white/5 p-4 backdrop-blur-sm">
            <p className="text-lg font-semibold leading-snug">{t.secure}</p>
          </div>
        </section>

        <section className="relative flex min-h-0 flex-col overflow-hidden p-4 sm:p-8 lg:min-h-[560px] lg:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 lg:hidden">
            <span className="login-float login-delay-two absolute -right-3 top-24 grid size-14 place-items-center rounded-2xl bg-primary/7 text-primary/25"><Wheat /></span>
            <span className="login-float login-delay-four absolute -left-3 bottom-16 grid size-12 place-items-center rounded-2xl bg-primary/7 text-primary/20"><Apple /></span>
          </div>

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <span className="relative size-10 shrink-0 overflow-hidden rounded-2xl shadow-md shadow-primary/15">
                <Image src="/icons/icon-192.png" alt="" fill sizes="40px" className="object-cover" priority />
              </span>
              <span className="text-sm font-semibold">Dépenses famille</span>
            </div>
            <div className="ms-auto flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-10 rounded-xl border-border bg-card/80 backdrop-blur-sm"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? t.light : t.dark}
                title={theme === "dark" ? t.light : t.dark}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Select value={language} onValueChange={(value) => setLanguage(value as LoginLanguage)}>
                <SelectTrigger aria-label="Langue" className="h-10 w-11 rounded-xl border-border bg-card/80 px-2 backdrop-blur-sm sm:w-[7.2rem]">
                  <Languages className="size-4" />
                  <span className="hidden sm:inline"><SelectValue /></span>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(languageNames) as LoginLanguage[]).map((key) => (
                    <SelectItem key={key} value={key}>{languageNames[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="relative z-[1] mx-auto my-4 w-full max-w-md sm:my-9 lg:my-auto">
            <div className="mb-3 flex items-center gap-2.5 sm:mb-4">
              <span className="login-float grid size-10 place-items-center rounded-2xl bg-primary/12 text-primary sm:size-11"><ShoppingBasket className="size-5" /></span>
              <div aria-hidden="true" className="flex items-center gap-1.5 lg:hidden">
                <span className="login-float login-delay-one grid size-7 place-items-center rounded-lg bg-secondary text-primary"><Milk className="size-3.5" /></span>
                <span className="login-float login-delay-three grid size-7 place-items-center rounded-lg bg-secondary text-[#c67500]"><Wheat className="size-3.5" /></span>
                <span className="login-twinkle ms-1 text-primary"><Sparkles className="size-4" /></span>
              </div>
            </div>
            <h1 className="text-[1.7rem] font-bold leading-tight tracking-[-0.04em] sm:text-3xl">
              {mode === "signup" ? t.signupTitle : t.title}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
              {mode === "signup" ? t.signupDescription : t.description}
            </p>

            <Tabs value={mode} onValueChange={changeMode} className="mt-4 sm:mt-5">
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl bg-muted/70 p-1">
                <TabsTrigger value="login" className="h-9 min-w-0 rounded-xl px-2 text-xs sm:text-sm">
                  <LogIn className="size-4" /> {t.loginTab}
                </TabsTrigger>
                <TabsTrigger value="signup" className="h-9 min-w-0 rounded-xl px-2 text-xs sm:text-sm">
                  <UserPlus className="size-4" /> {t.signupTab}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form className="space-y-3 sm:space-y-4" onSubmit={(event) => void submit(event)}>
                  <div className="space-y-1.5">
                    <Label htmlFor="family-login-name">{t.username}</Label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="family-login-name"
                        autoComplete="username"
                        required
                        maxLength={40}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder={t.usernamePlaceholder}
                        className="h-11 rounded-2xl border-border bg-background/70 ps-12 text-base shadow-sm transition-[border-color,box-shadow,background-color] focus-visible:bg-card sm:h-12"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="family-login-pin">{t.password}</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="family-login-pin"
                        type={showPassword ? "text" : "password"}
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(event) => setPassword(numericPin(event.target.value))}
                        className="h-11 rounded-2xl border-border bg-background/70 px-12 text-base tracking-[0.28em] shadow-sm transition-[border-color,box-shadow,background-color] focus-visible:bg-card sm:h-12"
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="absolute end-1.5 top-1/2 size-10 -translate-y-1/2 rounded-xl text-muted-foreground"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? t.hidePassword : t.showPassword}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  </div>

                  {error && (
                    <p role="alert" className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                      <AlertCircle className="size-4 shrink-0" /> {error}
                    </p>
                  )}

                  <Button type="submit" size="lg" className="h-11 w-full rounded-2xl text-base shadow-lg shadow-primary/15 transition-transform active:scale-[0.99] sm:h-12" disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
                    {t.submit}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-4">
                {createdUsername ? (
                  <div className="rounded-3xl border border-primary/20 bg-primary/7 p-5 text-center" aria-live="polite">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                      <CheckCircle2 className="size-6" />
                    </span>
                    <h2 className="mt-4 text-lg font-semibold">{t.created}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.createdDescription}</p>
                    <Button type="button" className="mt-5 h-11 w-full rounded-2xl" onClick={() => changeMode("login")}>
                      <LogIn /> {t.backToLogin}
                    </Button>
                  </div>
                ) : (
                  <form className="space-y-3" onSubmit={(event) => void submitSignup(event)}>
                    <div className="space-y-1.5">
                      <Label htmlFor="family-signup-name">{t.username}</Label>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="family-signup-name"
                          autoComplete="name"
                          required
                          minLength={2}
                          maxLength={40}
                          value={signupName}
                          onChange={(event) => setSignupName(event.target.value)}
                          placeholder={t.usernamePlaceholder}
                          className="h-11 rounded-2xl border-border bg-background/70 ps-12 text-base shadow-sm sm:h-12"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="family-signup-pin">{t.password}</Label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="family-signup-pin"
                          type={showPassword ? "text" : "password"}
                          inputMode="numeric"
                          pattern="[0-9]{4}"
                          maxLength={4}
                          autoComplete="new-password"
                          required
                          value={signupPin}
                          onChange={(event) => setSignupPin(numericPin(event.target.value))}
                          className="h-11 rounded-2xl border-border bg-background/70 px-12 text-base tracking-[0.28em] shadow-sm sm:h-12"
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="absolute end-1.5 top-1/2 size-10 -translate-y-1/2 rounded-xl text-muted-foreground"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={showPassword ? t.hidePassword : t.showPassword}
                        >
                          {showPassword ? <EyeOff /> : <Eye />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="family-confirm-pin">{t.confirmPin}</Label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="family-confirm-pin"
                          type={showPassword ? "text" : "password"}
                          inputMode="numeric"
                          pattern="[0-9]{4}"
                          maxLength={4}
                          autoComplete="new-password"
                          required
                          value={confirmPin}
                          onChange={(event) => setConfirmPin(numericPin(event.target.value))}
                          className="h-11 rounded-2xl border-border bg-background/70 ps-12 text-base tracking-[0.28em] shadow-sm sm:h-12"
                        />
                      </div>
                    </div>

                    {error && (
                      <p role="alert" className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                        <AlertCircle className="size-4 shrink-0" /> {error}
                      </p>
                    )}

                    <Button type="submit" size="lg" className="h-11 w-full rounded-2xl text-base shadow-lg shadow-primary/15 transition-transform active:scale-[0.99] sm:h-12" disabled={busy}>
                      {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}
                      {t.signupSubmit}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <p className="relative z-[1] mt-auto pt-3 text-center text-xs text-muted-foreground">{t.access}</p>
        </section>
      </div>
    </main>
  );
}
