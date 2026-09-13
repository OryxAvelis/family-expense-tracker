"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CalendarClock, CheckCircle2, ChevronRight, CircleDollarSign, Clock3, Crown, Flame, Loader2,
  Moon, Play, Repeat2, ShieldCheck, Sparkles, Sun, Trash2, WashingMachine,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { useFamilyTheme } from "@/hooks/use-family-theme";
import type { FamilySessionUser } from "@/lib/family-auth";

type Task = {
  id: string; title: string; description: string; template_id: string; creator_id: number; creator_name: string; assignee_id: number;
  assignee_name: string; reward_cents: number; priority: "normal" | "urgent";
  deadline: string | null; recurrence: "none" | "weekly" | "monthly";
  status: "pending" | "in_progress" | "completed" | "cancelled"; created_at: string; scope: "family" | "personal";
};
type Data = {
  users: Array<{ id: number; name: string; initials: string; role: string }>;
  tasks: Task[]; plan: "free" | "plus" | "pro"; usage: number; limit: number | null;
  familyPlan: "free" | "plus" | "pro"; personalPlan: "free" | "plus" | "pro";
  familyUsage: number; personalUsage: number; familyLimit: number | null; personalLimit: number | null;
  unlocked?: boolean; error?: string;
};

type ServiceTemplate = {
  id: string;
  title: string;
  emoji: string;
  price: number;
  duration: string;
  description: string;
  steps: readonly string[];
  gradient: string;
  scope: "family" | "personal";
};

const templates: readonly ServiceTemplate[] = [
  { id: "laundry", scope: "family", title: "Étendre le linge", emoji: "🧺", price: 500, duration: "15–25 min", description: "Josef prend le linge propre et l’étend soigneusement pour faciliter le séchage.", steps: ["Prendre le linge lavé", "Secouer et espacer chaque pièce", "Fixer correctement avec les pinces"], gradient: "from-sky-100 via-cyan-50 to-white dark:from-sky-950 dark:via-cyan-950/60 dark:to-card" },
  { id: "garbage", scope: "family", title: "Sortir les poubelles", emoji: "🗑️", price: 200, duration: "5–10 min", description: "Josef ferme les sacs, les descend et les dépose dans le conteneur adapté.", steps: ["Rassembler et fermer les sacs", "Vérifier qu’aucun sac ne fuit", "Déposer dans le conteneur extérieur"], gradient: "from-slate-100 via-zinc-50 to-white dark:from-slate-900 dark:via-zinc-900/70 dark:to-card" },
  { id: "gas", scope: "family", title: "Changer la bouteille de gaz", emoji: "🔥", price: 500, duration: "10–15 min", description: "Josef remplace la bouteille vide et contrôle le raccord avant utilisation.", steps: ["Fermer l’arrivée de gaz", "Installer et serrer la nouvelle bouteille", "Vérifier l’absence de fuite"], gradient: "from-orange-100 via-amber-50 to-white dark:from-orange-950 dark:via-amber-950/60 dark:to-card" },
  { id: "tidy", scope: "family", title: "Ranger la maison", emoji: "🏠", price: 2000, duration: "45–60 min", description: "Josef remet les espaces communs en ordre selon vos indications.", steps: ["Rassembler les objets déplacés", "Ranger les surfaces et espaces communs", "Laisser un passage propre et dégagé"], gradient: "from-emerald-100 via-green-50 to-white dark:from-emerald-950 dark:via-green-950/60 dark:to-card" },
  { id: "dishes", scope: "family", title: "Faire la vaisselle", emoji: "🍽️", price: 1000, duration: "25–40 min", description: "Josef lave, rince et range la vaisselle utilisée par la famille.", steps: ["Trier et vider la vaisselle", "Laver puis rincer soigneusement", "Sécher ou ranger à sa place"], gradient: "from-blue-100 via-indigo-50 to-white dark:from-blue-950 dark:via-indigo-950/60 dark:to-card" },
  { id: "shopping", scope: "family", title: "Petite course urgente", emoji: "🛍️", price: 500, duration: "Selon la distance", description: "Josef récupère rapidement un petit produit oublié à proximité. Le prix du produit reste séparé.", steps: ["Confirmer le produit exact", "Acheter au commerce disponible", "Remettre le produit et le ticket"], gradient: "from-violet-100 via-purple-50 to-white dark:from-violet-950 dark:via-purple-950/60 dark:to-card" },
  { id: "bathroom", scope: "family", title: "Nettoyer la salle de bain", emoji: "🛁", price: 1500, duration: "30–45 min", description: "Josef nettoie les surfaces principales de la salle de bain familiale.", steps: ["Nettoyer lavabo et robinetterie", "Laver la douche ou baignoire", "Nettoyer le sol et laisser l’espace rangé"], gradient: "from-cyan-100 via-sky-50 to-white dark:from-cyan-950 dark:via-sky-950/60 dark:to-card" },
  { id: "kitchen", scope: "family", title: "Nettoyer la cuisine", emoji: "🧽", price: 1500, duration: "30–45 min", description: "Josef nettoie les surfaces communes de la cuisine après utilisation.", steps: ["Essuyer le plan de travail", "Nettoyer évier et surfaces", "Passer le balai ou la serpillière"], gradient: "from-lime-100 via-emerald-50 to-white dark:from-lime-950 dark:via-emerald-950/60 dark:to-card" },
  { id: "family_custom", scope: "family", title: "Autre service familial", emoji: "✨", price: 200, duration: "À préciser", description: "Décrivez une autre tâche utile à toute la famille.", steps: ["Décrire clairement le besoin", "Choisir un prix entre 2 et 49 DH", "Josef confirme puis réalise la tâche"], gradient: "from-amber-100 via-yellow-50 to-white dark:from-amber-950 dark:via-yellow-950/60 dark:to-card" },
  { id: "clean", scope: "personal", title: "Nettoyer ma chambre", emoji: "🧹", price: 1000, duration: "30–45 min", description: "Josef range et nettoie simplement votre chambre selon vos instructions.", steps: ["Ranger les surfaces indiquées", "Balayer ou passer la serpillière", "Laisser la chambre propre et ordonnée"], gradient: "from-teal-100 via-emerald-50 to-white dark:from-teal-950 dark:via-emerald-950/60 dark:to-card" },
  { id: "website", scope: "personal", title: "Créer un petit site web", emoji: "💻", price: 4900, duration: "Sur devis", description: "Josef prépare une petite page web personnelle à partir de votre texte et de vos images.", steps: ["Définir le but et le contenu", "Créer une page simple et adaptée au téléphone", "Livrer le lien ou les fichiers"], gradient: "from-indigo-100 via-violet-50 to-white dark:from-indigo-950 dark:via-violet-950/60 dark:to-card" },
  { id: "computer", scope: "personal", title: "Aide ordinateur ou téléphone", emoji: "🛠️", price: 1500, duration: "20–40 min", description: "Josef vous aide pour un réglage, une installation ou un problème numérique simple.", steps: ["Identifier clairement le problème", "Effectuer le réglage ou expliquer la solution", "Vérifier que tout fonctionne"], gradient: "from-blue-100 via-sky-50 to-white dark:from-blue-950 dark:via-sky-950/60 dark:to-card" },
  { id: "documents", scope: "personal", title: "Préparer un document", emoji: "📄", price: 1000, duration: "20–35 min", description: "Josef met en forme un document, un CV ou une petite présentation.", steps: ["Recevoir le texte et le format souhaité", "Mettre le contenu en page", "Livrer le fichier final"], gradient: "from-slate-100 via-blue-50 to-white dark:from-slate-900 dark:via-blue-950/60 dark:to-card" },
  { id: "errand", scope: "personal", title: "Petite course personnelle", emoji: "🏃", price: 800, duration: "Selon la distance", description: "Josef réalise une petite course réservée à votre besoin personnel.", steps: ["Confirmer le lieu et le besoin", "Effectuer la course", "Remettre le résultat et le ticket si nécessaire"], gradient: "from-orange-100 via-rose-50 to-white dark:from-orange-950 dark:via-rose-950/60 dark:to-card" },
  { id: "homework", scope: "personal", title: "Aide aux devoirs", emoji: "📚", price: 1000, duration: "30–45 min", description: "Josef vous accompagne sur un exercice ou une révision ciblée.", steps: ["Choisir la matière et l’objectif", "Expliquer la méthode pas à pas", "Vérifier la compréhension"], gradient: "from-yellow-100 via-orange-50 to-white dark:from-yellow-950 dark:via-orange-950/60 dark:to-card" },
  { id: "personal_custom", scope: "personal", title: "Autre service personnel", emoji: "⭐", price: 200, duration: "À préciser", description: "Décrivez un service uniquement pour vous.", steps: ["Décrire clairement le besoin", "Choisir un prix entre 2 et 49 DH", "Josef confirme puis réalise la tâche"], gradient: "from-fuchsia-100 via-pink-50 to-white dark:from-fuchsia-950 dark:via-pink-950/60 dark:to-card" },
] as const;

const money = (cents: number) => `${(cents / 100).toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH`;
const statusLabels = { pending: "À faire", in_progress: "En cours", completed: "Terminée", cancelled: "Annulée" };
const rolePath = (role: FamilySessionUser["role"]) => role === "admin" ? "/admin" : role === "delivery" ? "/livreur" : "/membre";

export function HouseServices({ currentUser }: { currentUser: FamilySessionUser }) {
  const { theme, toggleTheme } = useFamilyTheme();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("active");
  const [catalogScope, setCatalogScope] = useState<"family" | "personal">("family");
  const [form, setForm] = useState({ templateId: "laundry", scope: "family" as "family" | "personal", title: "Étendre le linge", description: "", assigneeId: "", reward: "5", priority: "normal", deadline: "", recurrence: "none" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      const payload = await response.json() as Data;
      if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
      setData(payload); setError("");
      if (payload.users.length) {
        const delivery = payload.users.find((user) => user.role === "delivery") ?? payload.users[0];
        setForm((value) => value.assigneeId ? value : ({ ...value, assigneeId: String(delivery.id) }));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur."); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const act = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as Data;
      if (!response.ok) throw new Error(payload.error || "Action impossible.");
      setData(payload); toast.success(success); return true;
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Erreur."); return false; }
    finally { setBusy(false); }
  };

  const visible = useMemo(() => (data?.tasks ?? []).filter((task) => {
    if (filter === "active") return task.status === "pending" || task.status === "in_progress";
    return task.status === filter;
  }), [data?.tasks, filter]);
  const scopeUsage = catalogScope === "family" ? data?.familyUsage : data?.personalUsage;
  const scopeLimit = catalogScope === "family" ? data?.familyLimit : data?.personalLimit;
  const scopePlan = catalogScope === "family" ? data?.familyPlan : data?.personalPlan;
  const percentage = scopeLimit ? Math.min(100, Math.round(((scopeUsage ?? 0) / scopeLimit) * 100)) : 15;
  const visibleTemplates = templates.filter((item) => item.scope === catalogScope);
  const selectedTemplate = templates.find((item) => item.id === form.templateId) ?? templates[0];
  const selectedPlan = selectedTemplate.scope === "family" ? data?.familyPlan : data?.personalPlan;
  const openService = (service: ServiceTemplate) => {
    const delivery = data?.users.find((user) => user.role === "delivery") ?? data?.users[0];
    setForm((value) => ({
      ...value,
      templateId: service.id,
      scope: service.scope,
      title: service.id.endsWith("_custom") ? "" : service.title,
      description: "",
      assigneeId: delivery ? String(delivery.id) : value.assigneeId,
      reward: (service.price / 100).toFixed(service.price % 100 ? 2 : 0),
    }));
    setOpen(true);
  };

  if (!data) return <main className="grid min-h-screen place-items-center bg-background text-foreground"><div className="text-center">{error ? <><p>{error}</p><Button className="mt-4" onClick={() => void load()}>Réessayer</Button></> : <Loader2 className="mx-auto size-8 animate-spin text-primary" />}</div></main>;

  return (
    <main className="min-h-screen bg-background pb-24 text-foreground">
      <Toaster theme={theme} position="top-center" richColors />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href={rolePath(currentUser.role)}><Button size="icon" variant="outline" className="rounded-xl" aria-label="Retour"><ArrowLeft /></Button></Link>
          <Image src="/icons/icon-192.png" width={40} height={40} className="rounded-xl" alt="" />
          <div className="min-w-0 flex-1"><p className="truncate font-bold">Missions maison</p><p className="text-xs text-muted-foreground">La famille s’entraide, simplement.</p></div>
          <Link href="/abonnement"><Button variant="outline" className="rounded-xl" aria-label={`Ouvrir le forfait ${data.plan}`}><Crown className="text-[#e99a1b]"/><span className="hidden sm:inline">Forfait</span><Badge className="ms-1 uppercase">{data.plan}</Badge></Button></Link>
          <Button size="icon" variant="outline" className="rounded-xl" onClick={toggleTheme} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><Badge className="mb-3 rounded-full bg-primary/15 text-primary hover:bg-primary/15">SERVICES FAMILIAUX ET PERSONNELS</Badge><h1 className="max-w-2xl text-3xl font-black tracking-[-0.045em] sm:text-5xl">Choisissez un service, Josef s’occupe du reste.</h1><p className="mt-3 max-w-xl text-muted-foreground">Les besoins communs utilisent le forfait familial. Vos demandes privées restent personnelles.</p></div>
              <Button size="lg" className="h-13 rounded-2xl px-6 shadow-lg" onClick={() => document.getElementById("services-catalog")?.scrollIntoView({ behavior: "smooth" })}><Sparkles /> Voir les services</Button>
            </div>
          </div>
          <article className="rounded-[2rem] border border-border bg-card p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">{catalogScope === "family" ? "Forfait familial" : "Forfait personnel"}</span><Badge variant="outline" className="uppercase">{scopePlan}</Badge></div>
            <p className="mt-4 text-3xl font-black">{scopeUsage}<span className="text-base font-medium text-muted-foreground"> / {scopeLimit ?? "∞"}</span></p>
            <Progress value={percentage} className="mt-3 h-2.5" />
            <p className="mt-3 text-xs text-muted-foreground">{scopeLimit == null ? "Services illimités avec Pro." : `${Math.max(0, scopeLimit - (scopeUsage ?? 0))} services restants.`}</p>
          </article>
        </div>

        <section id="services-catalog" className="scroll-mt-24 pt-10">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-semibold text-primary">CATALOGUE</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{catalogScope === "family" ? "Services familiaux" : "Services personnels"}</h2><p className="mt-1 text-sm text-muted-foreground">{catalogScope === "family" ? "Pour les espaces et besoins partagés par toute la maison." : "Pour une demande privée, payée uniquement par vous."}</p></div>
            <div className="flex rounded-2xl bg-muted p-1">
              <Button size="sm" variant={catalogScope === "family" ? "default" : "ghost"} className="flex-1 rounded-xl sm:flex-none" onClick={() => setCatalogScope("family")}>Famille</Button>
              <Button size="sm" variant={catalogScope === "personal" ? "default" : "ghost"} className="flex-1 rounded-xl sm:flex-none" onClick={() => setCatalogScope("personal")}>Personnel</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {visibleTemplates.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => openService(service)}
                className="group overflow-hidden rounded-[1.55rem] border border-border bg-card text-start shadow-[0_16px_45px_rgba(0,0,0,.07)] transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_22px_60px_rgba(0,0,0,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`${service.title}, ${money(service.price)}, voir les détails`}
              >
                <div className={`relative grid aspect-[1.25] place-items-center overflow-hidden bg-gradient-to-br ${service.gradient}`}>
                  <span className="absolute -end-8 -top-8 size-24 rounded-full bg-white/35 blur-xl dark:bg-white/5" />
                  <span className="relative text-6xl drop-shadow-lg transition duration-300 group-hover:scale-110 sm:text-7xl" aria-hidden="true">{service.emoji}</span>
                  <Badge className="absolute end-3 top-3 rounded-full bg-card/90 text-foreground shadow-sm hover:bg-card/90">{service.duration}</Badge>
                </div>
                <div className="p-3.5 sm:p-4">
                  <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 sm:text-base">{service.title}</h3>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{service.scope === "family" ? "Famille" : "Personnel"}</p><p className="text-lg font-black text-primary sm:text-xl">{service.id.endsWith("_custom") ? "Dès " : ""}{money(service.price)}</p></div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition group-hover:translate-x-0.5"><ChevronRight className="size-4" /></span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-2xl font-bold">Tableau des missions</h2><p className="text-sm text-muted-foreground">{visible.length} mission{visible.length !== 1 ? "s" : ""}</p></div>
          <Tabs value={filter} onValueChange={setFilter}><TabsList className="rounded-xl"><TabsTrigger value="active">Actives</TabsTrigger><TabsTrigger value="completed">Terminées</TabsTrigger><TabsTrigger value="cancelled">Annulées</TabsTrigger></TabsList></Tabs>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((task) => {
            const canWork = currentUser.role === "admin" || task.assignee_id === currentUser.id;
            return <article key={task.id} className={`relative overflow-hidden rounded-[1.6rem] border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-xl ${task.priority === "urgent" && task.status !== "completed" ? "border-[#ff9f43]/60" : "border-border"}`}>
              {task.priority === "urgent" && <span className="absolute inset-x-0 top-0 h-1 bg-[#ff9f43]" />}
              <div className="flex items-start justify-between gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-xl">{templates.find((item) => item.id === task.template_id)?.emoji ?? "✨"}</div><div className="flex flex-wrap justify-end gap-1.5"><Badge variant="secondary">{task.scope === "personal" ? "Personnel" : "Famille"}</Badge><Badge variant={task.status === "completed" ? "default" : "outline"}>{statusLabels[task.status]}</Badge></div></div>
              <h3 className="mt-4 text-lg font-bold">{task.title}</h3>{task.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-muted/55 p-3"><span className="block text-xs text-muted-foreground">Demandé par</span><strong>{task.creator_name}</strong></div><div className="rounded-xl bg-muted/55 p-3"><span className="block text-xs text-muted-foreground">Prix</span><strong className="text-primary">{money(task.reward_cents)}</strong></div></div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{task.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{new Date(task.deadline).toLocaleDateString("fr-MA")}</span>}{task.recurrence !== "none" && <span className="inline-flex items-center gap-1"><Repeat2 className="size-3.5" />{task.recurrence === "weekly" ? "Chaque semaine" : "Chaque mois"}</span>}</div>
              {(task.status === "pending" || task.status === "in_progress") && <div className="mt-5 flex gap-2">
                {canWork && task.status === "pending" && <Button className="flex-1 rounded-xl" variant="outline" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "in_progress" }, "Mission commencée.")}><Play /> Commencer</Button>}
                {canWork && <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "completed" }, "Bravo, mission terminée !")}><CheckCircle2 /> Terminer</Button>}
                {(currentUser.role === "admin" || task.creator_id === currentUser.id) && <Button size="icon" variant="ghost" className="rounded-xl text-destructive" aria-label={`Annuler la mission ${task.title}`} disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "cancelled" }, "Mission annulée.")}><Trash2 /></Button>}
              </div>}
            </article>;
          })}
          {!visible.length && <div className="md:col-span-2 xl:col-span-3 rounded-[1.6rem] border border-dashed border-border p-12 text-center"><WashingMachine className="mx-auto size-10 text-primary"/><p className="mt-3 font-semibold">Aucune mission ici.</p><p className="text-sm text-muted-foreground">Créez la première mission pour votre famille.</p></div>}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94svh] overflow-y-auto rounded-[1.75rem] p-0 sm:max-w-2xl">
          <DialogHeader className="sr-only"><DialogTitle>{selectedTemplate.title}</DialogTitle><DialogDescription>Détails et commande du service</DialogDescription></DialogHeader>
          <div className={`relative grid min-h-44 place-items-center overflow-hidden rounded-t-[1.7rem] bg-gradient-to-br ${selectedTemplate.gradient}`}>
            <span className="absolute -end-12 -top-12 size-44 rounded-full bg-white/40 blur-2xl dark:bg-white/5" />
            <span className="relative text-8xl drop-shadow-xl" aria-hidden="true">{selectedTemplate.emoji}</span>
            <Badge className="absolute start-4 top-4 rounded-full bg-card/90 text-foreground shadow-sm hover:bg-card/90"><Clock3 className="size-3.5" /> {selectedTemplate.duration}</Badge>
          </div>
          <div className="space-y-6 p-5 pt-1 sm:p-7 sm:pt-2">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{selectedTemplate.scope === "family" ? "Service familial" : "Service personnel"}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{selectedTemplate.title}</h2></div>
              <div className="shrink-0 text-end"><p className="text-xs text-muted-foreground">Prix du service</p><p className="text-2xl font-black text-primary">{selectedTemplate.id.endsWith("_custom") ? "Dès " : ""}{money(selectedTemplate.price)}</p></div>
            </div>

            <p className="leading-7 text-muted-foreground">{selectedTemplate.description}</p>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <div className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary" /> Ce que Josef va faire</div>
              <ol className="space-y-2.5">{selectedTemplate.steps.map((step, index) => <li key={step} className="flex items-start gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-black text-primary">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {selectedTemplate.id.endsWith("_custom") && <div className="sm:col-span-2"><Label htmlFor="task-title">Nom du service</Label><Input id="task-title" className="mt-1.5 h-12 rounded-xl" placeholder={selectedTemplate.scope === "family" ? "Ex. Arroser les plantes" : "Ex. Organiser mes fichiers"} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>}
              <div className="sm:col-span-2"><Label htmlFor="task-description">Instructions pour Josef (facultatif)</Label><Textarea id="task-description" className="mt-1.5 min-h-24 rounded-xl" placeholder="Lieu, quantité ou détail important…" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
              <div><Label>Réalisé par</Label><div className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-border bg-muted/45 px-3"><span className="grid size-7 place-items-center rounded-lg bg-primary/12 text-xs font-black text-primary">{data.users.find((user) => String(user.id) === form.assigneeId)?.initials ?? "JO"}</span><strong>{data.users.find((user) => String(user.id) === form.assigneeId)?.name ?? "Josef"}</strong></div></div>
              {selectedTemplate.id.endsWith("_custom") ? <div><Label htmlFor="reward">Prix proposé (2–49 DH)</Label><div className="relative mt-1.5"><CircleDollarSign className="absolute start-3 top-3.5 size-5 text-muted-foreground"/><Input id="reward" type="number" min="2" max="49" step="0.5" className="h-12 rounded-xl ps-10" value={form.reward} onChange={(event) => setForm({ ...form, reward: event.target.value })}/></div></div> : <div><Label>Prix fixé</Label><div className="mt-1.5 flex h-12 items-center rounded-xl border border-border bg-muted/45 px-4 font-black text-primary">{money(selectedTemplate.price)}</div></div>}
              <div><Label htmlFor="deadline">Date souhaitée</Label><Input id="deadline" type="datetime-local" className="mt-1.5 h-12 rounded-xl" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })}/></div>
              <div><Label>Priorité</Label><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normale</SelectItem><SelectItem value="urgent"><span className="inline-flex items-center gap-2"><Flame className="size-4"/>Urgente</span></SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2"><Label>Répétition</Label><Select value={form.recurrence} onValueChange={(value) => setForm({ ...form, recurrence: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Une seule fois</SelectItem><SelectItem value="weekly" disabled={selectedPlan === "free"}>Chaque semaine {selectedPlan === "free" && "— Plus"}</SelectItem><SelectItem value="monthly" disabled={selectedPlan === "free"}>Chaque mois {selectedPlan === "free" && "— Plus"}</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 border-t border-border bg-card/95 p-4 backdrop-blur sm:p-5">
            <Button className="h-12 w-full rounded-xl" disabled={busy || !form.title.trim() || !form.assigneeId || Number(form.reward) < 2 || Number(form.reward) > 49} onClick={async () => { const ok = await act({ action: "create_task", scope: form.scope, templateId: form.templateId, title: form.title, description: form.description, assigneeId: Number(form.assigneeId), rewardCents: Math.round(Number(form.reward) * 100), priority: form.priority, deadline: form.deadline, recurrence: form.recurrence }, selectedTemplate.scope === "family" ? "Service familial demandé à Josef." : "Service personnel demandé à Josef."); if (ok) setOpen(false); }}><Sparkles /> Demander ce service · {money(Math.round(Number(form.reward) * 100))}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
