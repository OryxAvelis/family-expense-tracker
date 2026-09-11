"use client";

import {
  AlertCircle,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  LockKeyhole,
  Moon,
  ShoppingBasket,
  Sun,
  UserRound,
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
import { useFamilyTheme } from "@/hooks/use-family-theme";

type LoginLanguage = "fr" | "ar" | "en";

const copy = {
  fr: {
    title: "Bienvenue à la maison",
    description: "Connectez-vous avec le code donné par l’administrateur.",
    username: "Nom d’utilisateur",
    usernamePlaceholder: "Ex. papa",
    password: "Mot de passe",
    submit: "Se connecter",
    error: "Connexion impossible.",
    secure: "Chaque personne ouvre automatiquement son propre espace.",
    light: "Mode clair",
    dark: "Mode sombre",
  },
  ar: {
    title: "مرحبا بكم في البيت",
    description: "سجّل الدخول بالرمز الذي أعطاك المسؤول.",
    username: "اسم المستخدم",
    usernamePlaceholder: "مثال: papa",
    password: "كلمة المرور",
    submit: "تسجيل الدخول",
    error: "تعذر تسجيل الدخول.",
    secure: "كل شخص يدخل مباشرة إلى فضائه الخاص.",
    light: "الوضع الفاتح",
    dark: "الوضع الداكن",
  },
  en: {
    title: "Welcome home",
    description: "Sign in with the code provided by the administrator.",
    username: "Username",
    usernamePlaceholder: "Example: papa",
    password: "Password",
    submit: "Sign in",
    error: "Unable to sign in.",
    secure: "Each person automatically opens their own space.",
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { theme, toggleTheme } = useFamilyTheme();
  const t = copy[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { route?: string; error?: string };
      if (!response.ok || !payload.route) throw new Error(payload.error || t.error);
      window.location.assign(payload.route);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t.error);
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_30px_90px_rgba(8,40,31,0.14)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="relative hidden min-h-[640px] overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(85,229,187,0.24),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(255,180,84,0.15),transparent_32%)]" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-sidebar-primary text-xl font-black text-sidebar-primary-foreground">D</span>
            <div>
              <p className="font-semibold">Dépenses famille</p>
              <p className="text-sm text-sidebar-foreground/65">Courses de la maison</p>
            </div>
          </div>

          <div className="relative">
            <div
              role="img"
              aria-label="Produits essentiels de la maison"
              className="mb-8 aspect-[1.45] w-full rounded-[1.7rem] border border-white/10 bg-cover bg-center shadow-2xl"
              style={{ backgroundImage: "url('/product-sprite.png')" }}
            />
            <p className="max-w-sm text-2xl font-bold leading-tight">{t.secure}</p>
          </div>
        </section>

        <section className="flex min-h-[620px] flex-col p-6 sm:p-10 lg:p-14">
          <div className="mb-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary font-black text-primary-foreground">D</span>
              <span className="text-sm font-semibold">Dépenses famille</span>
            </div>
            <div className="ms-auto flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="rounded-xl border-border"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? t.light : t.dark}
                title={theme === "dark" ? t.light : t.dark}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Select value={language} onValueChange={(value) => setLanguage(value as LoginLanguage)}>
                <SelectTrigger aria-label="Langue" className="h-9 w-12 rounded-xl border-border px-2 sm:w-[7.2rem]">
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

          <div className="my-12 sm:my-16">
            <span className="mb-6 grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><ShoppingBasket /></span>
            <h1 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">{t.title}</h1>
            <p className="mt-3 max-w-md leading-7 text-muted-foreground">{t.description}</p>

            <form className="mt-9 space-y-5" onSubmit={(event) => void submit(event)}>
              <div className="space-y-2">
                <Label htmlFor="family-username">{t.username}</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="family-username"
                    autoComplete="username"
                    autoCapitalize="none"
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder={t.usernamePlaceholder}
                    className="h-13 rounded-2xl border-border bg-background/65 ps-12 text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="family-password">{t.password}</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="family-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-13 rounded-2xl border-border bg-background/65 px-12 text-base"
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-xl text-muted-foreground"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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

              <Button type="submit" size="lg" className="h-13 w-full rounded-2xl text-base" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {t.submit}
              </Button>
            </form>
          </div>

          <p className="mt-auto text-center text-xs text-muted-foreground">Accès réservé à la famille</p>
        </section>
      </div>
    </main>
  );
}
