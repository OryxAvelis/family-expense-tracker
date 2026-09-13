"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CalendarClock, CheckCircle2, CircleDollarSign, Crown, Flame, Loader2,
  Moon, Play, Plus, Repeat2, Sparkles, Sun, Trash2, WashingMachine,
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
  status: "pending" | "in_progress" | "completed" | "cancelled"; created_at: string;
};
type Data = {
  users: Array<{ id: number; name: string; initials: string; role: string }>;
  tasks: Task[]; plan: "free" | "plus" | "pro"; usage: number; limit: number | null;
  unlocked?: boolean; error?: string;
};

const templates = [
  ["laundry", "Étendre le linge", "🧺"], ["garbage", "Sortir les poubelles", "🗑️"],
  ["gas", "Changer la bouteille de gaz", "🔥"], ["tidy", "Ranger la maison", "🏠"],
  ["dishes", "Faire la vaisselle", "🍽️"], ["shopping", "Petite course urgente", "🛍️"],
  ["clean", "Nettoyer une pièce", "🧹"], ["custom", "Autre mission", "✨"],
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
  const [form, setForm] = useState({ templateId: "laundry", title: "Étendre le linge", description: "", assigneeId: "", reward: "2", priority: "normal", deadline: "", recurrence: "none" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      const payload = await response.json() as Data;
      if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
      setData(payload); setError("");
      if (payload.users.length) setForm((value) => value.assigneeId ? value : ({ ...value, assigneeId: String(payload.users[0].id) }));
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
  const percentage = data?.limit ? Math.min(100, Math.round((data.usage / data.limit) * 100)) : 15;

  if (!data) return <main className="grid min-h-screen place-items-center bg-background text-foreground"><div className="text-center">{error ? <><p>{error}</p><Button className="mt-4" onClick={() => void load()}>Réessayer</Button></> : <Loader2 className="mx-auto size-8 animate-spin text-primary" />}</div></main>;

  return (
    <main className="min-h-screen bg-background pb-24 text-foreground">
      <Toaster theme={theme} position="top-center" richColors />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link href={rolePath(currentUser.role)}><Button size="icon" variant="outline" className="rounded-xl" aria-label="Retour"><ArrowLeft /></Button></Link>
          <Image src="/icons/icon-192.png" width={40} height={40} className="rounded-xl" alt="" />
          <div className="min-w-0 flex-1"><p className="truncate font-bold">Missions maison</p><p className="text-xs text-muted-foreground">La famille s’entraide, simplement.</p></div>
          <Link href="/abonnement"><Button variant="outline" className="rounded-xl"><Crown className="text-[#e99a1b]"/><span className="hidden sm:inline">Forfait</span><Badge className="ms-1 uppercase">{data.plan}</Badge></Button></Link>
          <Button size="icon" variant="outline" className="rounded-xl" onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><Badge className="mb-3 rounded-full bg-primary/15 text-primary hover:bg-primary/15">NOUVEAU SERVICE</Badge><h1 className="max-w-2xl text-3xl font-black tracking-[-0.045em] sm:text-5xl">Les petites tâches deviennent simples.</h1><p className="mt-3 max-w-xl text-muted-foreground">Créez une mission, choisissez une personne et une récompense. Chacun sait exactement quoi faire.</p></div>
              <Button size="lg" className="h-13 rounded-2xl px-6 shadow-lg" onClick={() => setOpen(true)}><Plus /> Nouvelle mission</Button>
            </div>
          </div>
          <article className="rounded-[2rem] border border-border bg-card p-5">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Utilisation mensuelle</span><Badge variant="outline" className="uppercase">{data.plan}</Badge></div>
            <p className="mt-4 text-3xl font-black">{data.usage}<span className="text-base font-medium text-muted-foreground"> / {data.limit ?? "∞"}</span></p>
            <Progress value={percentage} className="mt-3 h-2.5" />
            <p className="mt-3 text-xs text-muted-foreground">{data.limit === null ? "Missions illimitées avec Pro." : `${Math.max(0, data.limit - data.usage)} missions restantes.`}</p>
          </article>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-2xl font-bold">Tableau des missions</h2><p className="text-sm text-muted-foreground">{visible.length} mission{visible.length !== 1 ? "s" : ""}</p></div>
          <Tabs value={filter} onValueChange={setFilter}><TabsList className="rounded-xl"><TabsTrigger value="active">Actives</TabsTrigger><TabsTrigger value="completed">Terminées</TabsTrigger><TabsTrigger value="cancelled">Annulées</TabsTrigger></TabsList></Tabs>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((task) => {
            const canWork = currentUser.role === "admin" || task.assignee_id === currentUser.id;
            return <article key={task.id} className={`relative overflow-hidden rounded-[1.6rem] border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-xl ${task.priority === "urgent" && task.status !== "completed" ? "border-[#ff9f43]/60" : "border-border"}`}>
              {task.priority === "urgent" && <span className="absolute inset-x-0 top-0 h-1 bg-[#ff9f43]" />}
              <div className="flex items-start justify-between gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-xl">{templates.find((item) => item[0] === task.template_id)?.[2] ?? "✨"}</div><Badge variant={task.status === "completed" ? "default" : "outline"}>{statusLabels[task.status]}</Badge></div>
              <h3 className="mt-4 text-lg font-bold">{task.title}</h3>{task.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-muted/55 p-3"><span className="block text-xs text-muted-foreground">Pour</span><strong>{task.assignee_name}</strong></div><div className="rounded-xl bg-muted/55 p-3"><span className="block text-xs text-muted-foreground">Récompense</span><strong className="text-primary">{money(task.reward_cents)}</strong></div></div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{task.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{new Date(task.deadline).toLocaleDateString("fr-MA")}</span>}{task.recurrence !== "none" && <span className="inline-flex items-center gap-1"><Repeat2 className="size-3.5" />{task.recurrence === "weekly" ? "Chaque semaine" : "Chaque mois"}</span>}</div>
              {(task.status === "pending" || task.status === "in_progress") && <div className="mt-5 flex gap-2">
                {canWork && task.status === "pending" && <Button className="flex-1 rounded-xl" variant="outline" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "in_progress" }, "Mission commencée.")}><Play /> Commencer</Button>}
                {canWork && <Button className="flex-1 rounded-xl" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "completed" }, "Bravo, mission terminée !")}><CheckCircle2 /> Terminer</Button>}
                {(currentUser.role === "admin" || task.creator_id === currentUser.id) && <Button size="icon" variant="ghost" className="rounded-xl text-destructive" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "cancelled" }, "Mission annulée.")}><Trash2 /></Button>}
              </div>}
            </article>;
          })}
          {!visible.length && <div className="md:col-span-2 xl:col-span-3 rounded-[1.6rem] border border-dashed border-border p-12 text-center"><WashingMachine className="mx-auto size-10 text-primary"/><p className="mt-3 font-semibold">Aucune mission ici.</p><p className="text-sm text-muted-foreground">Créez la première mission pour votre famille.</p></div>}
        </div>
      </section>

      <Button className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 z-20 h-14 rounded-full px-6 shadow-2xl sm:hidden" onClick={() => setOpen(true)}><Plus /> Nouvelle mission</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92svh] overflow-y-auto rounded-[1.75rem] sm:max-w-xl">
          <DialogHeader><DialogTitle className="text-2xl">Créer une mission</DialogTitle><DialogDescription>Une demande claire, une récompense motivante.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-4 gap-2">{templates.map(([id, title, emoji]) => <button key={id} type="button" onClick={() => setForm((value) => ({ ...value, templateId: id, title: id === "custom" ? "" : title }))} className={`rounded-xl border p-2 text-center text-xs transition ${form.templateId === id ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/30"}`}><span className="block text-xl">{emoji}</span><span className="mt-1 block truncate">{title}</span></button>)}</div>
          <div className="space-y-4">
            <div><Label htmlFor="task-title">Mission</Label><Input id="task-title" className="mt-1.5 h-12 rounded-xl" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
            <div><Label htmlFor="task-description">Détails (facultatif)</Label><Textarea id="task-description" className="mt-1.5 rounded-xl" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Personne assignée</Label><Select value={form.assigneeId} onValueChange={(value) => setForm({ ...form, assigneeId: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{data.users.map((user) => <SelectItem key={user.id} value={String(user.id)}>{user.name}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="reward">Récompense (DH)</Label><div className="relative mt-1.5"><CircleDollarSign className="absolute start-3 top-3.5 size-5 text-muted-foreground"/><Input id="reward" type="number" min="0.5" step="0.5" className="h-12 rounded-xl ps-10" value={form.reward} onChange={(event) => setForm({ ...form, reward: event.target.value })}/></div></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="deadline">Date limite</Label><Input id="deadline" type="datetime-local" className="mt-1.5 h-12 rounded-xl" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })}/></div><div><Label>Priorité</Label><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normale</SelectItem><SelectItem value="urgent"><span className="inline-flex items-center gap-2"><Flame className="size-4"/>Urgente</span></SelectItem></SelectContent></Select></div></div>
            <div><Label>Répétition</Label><Select value={form.recurrence} onValueChange={(value) => setForm({ ...form, recurrence: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Une seule fois</SelectItem><SelectItem value="weekly" disabled={data.plan === "free"}>Chaque semaine {data.plan === "free" && "— Plus"}</SelectItem><SelectItem value="monthly" disabled={data.plan === "free"}>Chaque mois {data.plan === "free" && "— Plus"}</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button className="h-12 w-full rounded-xl" disabled={busy || !form.title.trim() || !form.assigneeId} onClick={async () => { const ok = await act({ action: "create_task", templateId: form.templateId, title: form.title, description: form.description, assigneeId: Number(form.assigneeId), rewardCents: Math.round(Number(form.reward) * 100), priority: form.priority, deadline: form.deadline, recurrence: form.recurrence }, "Mission créée."); if (ok) setOpen(false); }}><Sparkles /> Créer la mission</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
