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
    pinHint: "Votre code personnel à 4 chiffres",
    listen: "Écouter",
    enter: "Entrer dans la famille",
    choose: "Choisissez d’abord votre photo.",
    wrongPin: "Ce code ne marche pas. Réessayez.",
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
    pinHint: "الرقم ديالك فيه 4 أرقام",
    listen: "سمعني",
    enter: "دخل للدار",
    choose: "اختار صورتك الأول.",
    wrongPin: "هاد الرقم ما خدمش. عاود جرب.",
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
    pinHint: "Your personal 4-digit code",
    listen: "Listen",
    enter: "Enter the family",
    choose: "Choose your photo first.",
    wrongPin: "That code did not work. Try again.",
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
}: {
  familyCode?: string;
}) {
  const [directory, setDirectory] = useState<FamilyDirectory | null>(null);
  const [language, setLanguage] = useState<EntranceLanguage>("fr");
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pinPanelRef = useRef<HTMLDivElement>(null);
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
    window.setTimeout(() => pinPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
  };

  const pressDigit = (digit: string) => {
    if (busy || pin.length >= 12) return;
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
    if (!(/^(?:\d{4}|\d{6,12})$/).test(pin)) return;

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
        }),
      });
      const payload = (await response.json()) as { error?: string; route?: string };
      if (!response.ok || !payload.route) throw new Error(t.wrongPin);
      window.location.assign(payload.route);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t.wrongPin);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) pressDigit(event.key);
      else if (event.key === "Backspace") removeDigit();
      else if (event.key === "Enter" && pin.length >= 4) void submit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const pinSlots = Math.max(4, pin.length);

  return (
    <main dir={direction} className="relative min-h-[100svh] overflow-hidden bg-[#fffdf8] text-[#0a2b23]">
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
          <div className="my-auto grid gap-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch lg:gap-7 lg:py-10">
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
                "rounded-[2rem] border bg-white/95 p-5 shadow-[0_22px_60px_rgba(6,76,61,0.10)] transition-colors sm:p-7",
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
                      <p className="mt-1 text-sm text-[#687c76]">{selected ? t.pinHint : t.choose}</p>
                    </div>
                  </div>
                  <Button type="button" size="icon" variant="outline" className="size-12 shrink-0 rounded-2xl border-[#cce3dc]" onClick={speak} aria-label={t.listen} title={t.listen}>
                    <Volume2 className="size-6 text-[#008d70]" />
                  </Button>
                </div>

                <form className="mt-6 flex flex-1 flex-col" onSubmit={(event) => void submit(event)}>
                  <div className="flex min-h-12 flex-wrap items-center justify-center gap-3" aria-label={`${pin.length} chiffres saisis`}>
                    {Array.from({ length: pinSlots }, (_, index) => (
                      <span
                        key={index}
                        className={cn(
                          "size-5 rounded-full border-2 sm:size-6",
                          index < pin.length ? "border-[#007b61] bg-[#007b61]" : "border-[#bdd5ce] bg-[#f4f8f6]",
                        )}
                      />
                    ))}
                  </div>

                  <div className="mx-auto mt-6 grid w-full max-w-sm grid-cols-3 gap-2.5 sm:gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        disabled={!selected || busy}
                        onClick={() => pressDigit(digit)}
                        className="h-16 rounded-2xl border border-[#cce3dc] bg-[#eaf8f1] text-3xl font-black text-[#073f34] shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-[#dcf4eb] active:translate-y-0 disabled:opacity-45 sm:h-[4.5rem]"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={speak}
                      className="grid h-16 place-items-center rounded-2xl border border-[#cce3dc] bg-[#f7fbf9] text-[#008d70] disabled:opacity-45 sm:h-[4.5rem]"
                      aria-label={t.listen}
                    >
                      <Volume2 className="size-7" />
                    </button>
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={() => pressDigit("0")}
                      className="h-16 rounded-2xl border border-[#cce3dc] bg-[#eaf8f1] text-3xl font-black text-[#073f34] shadow-sm disabled:opacity-45 sm:h-[4.5rem]"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      disabled={!selected || busy || !pin}
                      onClick={removeDigit}
                      className="grid h-16 place-items-center rounded-2xl border border-[#cce3dc] bg-[#f7fbf9] text-[#073f34] disabled:opacity-45 sm:h-[4.5rem]"
                      aria-label="Effacer un chiffre"
                    >
                      <Delete className="size-7" />
                    </button>
                  </div>

                  {error && (
                    <p role="alert" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-[#f2bcbc] bg-[#fff1f1] px-4 py-3 text-center text-sm font-semibold text-[#a52626]">
                      <AlertCircle className="size-5 shrink-0" /> {error}
                    </p>
                  )}

                  <div className="mt-auto pt-5">
                    <Button
                      type="submit"
                      disabled={!selected || busy || !(/^(?:\d{4}|\d{6,12})$/).test(pin)}
                      className="h-14 w-full rounded-2xl bg-[#008d70] text-base font-bold text-white shadow-lg shadow-[#008d70]/20 hover:bg-[#00775f]"
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
                      {t.enter}
                      {direction === "rtl" ? <ArrowLeft /> : <ArrowRight />}
                    </Button>
                    {selected && (
                      <button type="button" onClick={() => { setSelected(null); setPin(""); setError(""); }} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[#5d706b] hover:bg-[#eef6f2]">
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
