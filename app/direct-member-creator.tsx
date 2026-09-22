"use client";

import {
  Baby,
  Check,
  Delete,
  Loader2,
  PersonStanding,
  UserRound,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { ProfileAvatar } from "@/app/profile-photo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Language = "fr" | "ar" | "en";

type MemberSummary = {
  id: number;
  name: string;
  initials: string;
  role: "admin" | "delivery" | "member";
};

const directMemberCopy = {
  fr: {
    eyebrow: "PERSONNES DE LA MAISON",
    title: "Qui ajoutons-nous à la famille ?",
    help: "Touchez un choix ou écrivez simplement le prénom. Aucun lien ni invitation.",
    mother: "Maman",
    father: "Papa",
    daughter: "Ma fille",
    son: "Mon fils",
    other: "Autre personne",
    name: "Prénom ou nom",
    namePlaceholder: "Ex. Khadija",
    pin: "Son code à 4 chiffres",
    pinHelp: "Donnez-lui ce petit code en personne.",
    create: "Ajouter cette personne",
    created: "La personne a été ajoutée à la famille.",
    current: "Déjà dans la famille",
  },
  ar: {
    eyebrow: "الناس ديال الدار",
    title: "شكون نزيدو للدار؟",
    help: "اختار واحد أو كتب سميتو. بلا رابط وبلا دعوة.",
    mother: "ماما",
    father: "بابا",
    daughter: "بنتي",
    son: "ولدي",
    other: "شخص آخر",
    name: "السّمية",
    namePlaceholder: "مثال: خديجة",
    pin: "الرقم ديالو من 4 أرقام",
    pinHelp: "عطيه الرقم مباشرة.",
    create: "زيد هاد الشخص",
    created: "تزاد الشخص للدار.",
    current: "كاينين فالدار",
  },
  en: {
    eyebrow: "PEOPLE AT HOME",
    title: "Who should we add to the family?",
    help: "Tap a choice or enter a name. No link and no invitation.",
    mother: "Mum",
    father: "Dad",
    daughter: "My daughter",
    son: "My son",
    other: "Someone else",
    name: "First name or name",
    namePlaceholder: "Example: Khadija",
    pin: "Their 4-digit code",
    pinHelp: "Tell them this short code in person.",
    create: "Add this person",
    created: "The person was added to the family.",
    current: "Already in the family",
  },
} as const;

export function DirectMemberCreator({
  language,
  members,
  busy,
  onCreate,
}: {
  language: Language;
  members: MemberSummary[];
  busy: boolean;
  onCreate: (name: string, pin: string, successMessage: string) => Promise<boolean>;
}) {
  const t = directMemberCopy[language];
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");

  const presets = [
    { key: "mother", label: t.mother, Icon: UserRound, color: "bg-[#fff0ed]" },
    { key: "father", label: t.father, Icon: PersonStanding, color: "bg-[#eaf8f1]" },
    { key: "daughter", label: t.daughter, Icon: Baby, color: "bg-[#fff7dc]" },
    { key: "son", label: t.son, Icon: Baby, color: "bg-[#edf5ff]" },
  ] as const;

  const choosePreset = (key: string, label: string) => {
    setSelectedPreset(key);
    setName(label);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2 || pin.length !== 4) return;
    const created = await onCreate(name.trim(), pin, t.created);
    if (created) {
      setName("");
      setPin("");
      setSelectedPreset("");
    }
  };

  return (
    <section className="mb-8 overflow-hidden rounded-[2rem] border border-primary/20 bg-card shadow-sm">
      <div className="border-b border-border bg-primary/[0.045] p-4 sm:p-6">
        <p className="text-xs font-bold tracking-[0.16em] text-primary">{t.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">{t.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t.help}</p>
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div>
          <div className="grid grid-cols-2 gap-3">
            {presets.map(({ key, label, Icon, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => choosePreset(key, label)}
                className={cn(
                  "relative grid min-h-32 place-items-center rounded-3xl border-2 p-4 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  color,
                  selectedPreset === key ? "border-primary" : "border-transparent",
                )}
              >
                <span className="grid size-14 place-items-center rounded-full bg-white/80 text-primary shadow-sm">
                  <Icon className="size-7" />
                </span>
                <strong className="mt-2 text-lg">{label}</strong>
                {selectedPreset === key && (
                  <span className="absolute end-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setSelectedPreset("other"); setName(""); }}
            className={cn(
              "mt-3 flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl border-2 bg-primary/[0.045] px-4 text-lg font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              selectedPreset === "other" ? "border-primary" : "border-transparent",
            )}
          >
            <UserRoundPlus className="size-7 text-primary" /> {t.other}
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)} className="flex flex-col rounded-3xl border border-border bg-background/60 p-4 sm:p-5">
          <div className="space-y-2">
            <Label htmlFor="direct-member-name" className="text-base">{t.name}</Label>
            <Input
              id="direct-member-name"
              value={name}
              onChange={(event) => { setName(event.target.value); setSelectedPreset(""); }}
              placeholder={t.namePlaceholder}
              minLength={2}
              maxLength={80}
              required
              className="h-14 rounded-2xl bg-card px-4 text-lg"
            />
          </div>

          <div className="mt-5 text-center">
            <Label className="text-base">{t.pin}</Label>
            <p className="mt-1 text-xs text-muted-foreground">{t.pinHelp}</p>
            <div className="mt-4 flex justify-center gap-3" aria-label={`${pin.length} chiffres saisis`}>
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className={cn("size-5 rounded-full border-2", index < pin.length ? "border-primary bg-primary" : "border-border bg-card")} />
              ))}
            </div>
          </div>

          <div className="mx-auto mt-5 grid w-full max-w-xs grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <button key={digit} type="button" disabled={busy || pin.length >= 4} onClick={() => setPin((current) => `${current}${digit}`.slice(0, 4))} className="h-12 rounded-2xl border border-border bg-card text-xl font-bold hover:bg-secondary disabled:opacity-45">
                {digit}
              </button>
            ))}
            <span aria-hidden="true" />
            <button type="button" disabled={busy || pin.length >= 4} onClick={() => setPin((current) => `${current}0`.slice(0, 4))} className="h-12 rounded-2xl border border-border bg-card text-xl font-bold hover:bg-secondary disabled:opacity-45">0</button>
            <button type="button" disabled={busy || !pin} onClick={() => setPin((current) => current.slice(0, -1))} className="grid h-12 place-items-center rounded-2xl border border-border bg-card hover:bg-secondary disabled:opacity-45" aria-label="Effacer un chiffre">
              <Delete className="size-5" />
            </button>
          </div>

          <Button type="submit" disabled={busy || name.trim().length < 2 || pin.length !== 4} className="mt-5 h-14 w-full rounded-2xl text-base font-bold">
            {busy ? <Loader2 className="animate-spin" /> : <UserRoundPlus />} {t.create}
          </Button>
        </form>
      </div>

      {members.length > 0 && (
        <div className="border-t border-border px-4 py-5 sm:px-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><UsersRound className="size-4" /> {t.current}</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {members.map((member) => (
              <div key={member.id} className="flex min-w-36 items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
                <ProfileAvatar user={member} className="size-11 rounded-xl text-xs" />
                <span className="min-w-0 truncate font-semibold">{member.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
