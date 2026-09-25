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
import { SERVICE_TEMPLATES, type ServiceTemplate } from "@/lib/service-catalog";
import { normalizeServicesLanguage, servicesCopy, servicesViewMode, type ServicesLanguage } from "@/lib/services-page-copy";

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

const templates = SERVICE_TEMPLATES;

const rolePath = (role: FamilySessionUser["role"]) => role === "admin" ? "/admin" : role === "delivery" ? "/livreur" : "/membre";

export function HouseServices({ currentUser }: { currentUser: FamilySessionUser }) {
  const { theme, toggleTheme } = useFamilyTheme();
  const [language, setLanguage] = useState<ServicesLanguage>("fr");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("active");
  const [catalogScope, setCatalogScope] = useState<"family" | "personal">("family");
  const [form, setForm] = useState({ templateId: "laundry", scope: "family" as "family" | "personal", title: "Étendre le linge", description: "", assigneeId: "", reward: "5", priority: "normal", deadline: "", recurrence: "none" });
  const t = servicesCopy[language];
  const isBuyer = servicesViewMode(currentUser.role) === "buyer";
  const direction = language === "ar" ? "rtl" : "ltr";
  const locale = language === "ar" ? "ar-MA" : language === "en" ? "en-MA" : "fr-MA";
  const money = (cents: number) => `${(cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${language === "ar" ? "د.م." : "DH"}`;
  const statusLabels = {
    pending: t.statusPending,
    in_progress: t.statusInProgress,
    completed: t.statusCompleted,
    cancelled: t.statusCancelled,
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedLanguage = normalizeServicesLanguage(window.localStorage.getItem("family-expense-language"));
      const savedScope = window.localStorage.getItem("family-services-scope");
      setLanguage(savedLanguage);
      if (savedScope === "family" || savedScope === "personal") setCatalogScope(savedScope);
    });
    const updateFromStorage = (event: StorageEvent) => {
      if (event.key === "family-expense-language") setLanguage(normalizeServicesLanguage(event.newValue));
      if (event.key === "family-services-scope" && (event.newValue === "family" || event.newValue === "personal")) setCatalogScope(event.newValue);
    };
    window.addEventListener("storage", updateFromStorage);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", updateFromStorage);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const selectCatalogScope = (scope: "family" | "personal") => {
    setCatalogScope(scope);
    window.localStorage.setItem("family-services-scope", scope);
  };

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      const payload = await response.json() as Data;
      if (!response.ok) throw new Error(payload.error || "services_load_error");
      setData(payload); setError("");
      if (payload.users.length) {
        const delivery = payload.users.find((user) => user.role === "delivery") ?? payload.users[0];
        setForm((value) => value.assigneeId ? value : ({ ...value, assigneeId: String(delivery.id) }));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "services_load_error"); }
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
      if (!response.ok) throw new Error(payload.error || t.actionError);
      setData(payload); toast.success(success); return true;
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : t.actionError); return false; }
    finally { setBusy(false); }
  };

  const roleTasks = useMemo(() => (data?.tasks ?? []).filter((task) => !isBuyer || task.assignee_id === currentUser.id), [currentUser.id, data?.tasks, isBuyer]);
  const visible = useMemo(() => roleTasks.filter((task) => {
    if (filter === "active") return task.status === "pending" || task.status === "in_progress";
    return task.status === filter;
  }), [filter, roleTasks]);
  const scopeUsage = catalogScope === "family" ? data?.familyUsage : data?.personalUsage;
  const scopeLimit = catalogScope === "family" ? data?.familyLimit : data?.personalLimit;
  const scopePlan = catalogScope === "family" ? data?.familyPlan : data?.personalPlan;
  const percentage = scopeLimit ? Math.min(100, Math.round(((scopeUsage ?? 0) / scopeLimit) * 100)) : 100;
  const visibleTemplates = templates.filter((item) => item.scope === catalogScope);
  const selectedTemplate = templates.find((item) => item.id === form.templateId) ?? templates[0];
  const selectedPlan = selectedTemplate.scope === "family" ? data?.familyPlan : data?.personalPlan;
  const familyBuyer = data?.users.find((user) => user.role === "delivery");
  const buyerName = familyBuyer?.name ?? "l’acheteur familial";
  const buyerInitials = familyBuyer?.initials ?? "AF";
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

  if (!data) return <main dir={direction} className="grid min-h-screen place-items-center bg-background text-foreground"><div className="text-center" role="status" aria-live="polite">{error ? <><p>{error === "services_load_error" ? t.loadError : error}</p><Button className="mt-4 min-h-11 rounded-xl" onClick={() => void load()}>{t.retry}</Button></> : <><Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">{t.loading}</span></>}</div></main>;

  const emptyTitle = filter === "completed" ? t.noCompletedTitle : filter === "cancelled" ? t.noCancelledTitle : isBuyer ? t.noActiveBuyerTitle : t.noActiveRequesterTitle;
  const emptyDescription = filter === "completed" ? t.noCompletedDescription : filter === "cancelled" ? t.noCancelledDescription : isBuyer ? t.noActiveBuyerDescription : t.noActiveRequesterDescription;
  const remaining = scopeLimit == null ? null : Math.max(0, scopeLimit - (scopeUsage ?? 0));
  const scopeTitle = catalogScope === "family" ? t.familyServices : t.personalServices;
  const scopeDescription = catalogScope === "family" ? t.familyDescription : t.personalDescription;

  const planSummary = (
    <Link
      href="/abonnement"
      aria-label={`${t.openPlan}: ${catalogScope === "family" ? t.familyPlan : t.personalPlan}, ${scopePlan}`}
      className="group grid min-h-16 grid-cols-[2.75rem_1fr_auto] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm outline-none transition hover:border-primary/35 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-4"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Crown className="size-5" /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="truncate">{catalogScope === "family" ? t.familyPlan : t.personalPlan}</span>
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] uppercase">{scopePlan}</Badge>
        </span>
        <span className="mt-1 block text-sm font-bold">
          {remaining == null ? t.unlimited : `${remaining} ${t.remaining}`}
          <span className="font-normal text-muted-foreground"> · {scopeUsage ?? 0}{scopeLimit == null ? "" : `/${scopeLimit}`} {t.used}</span>
        </span>
      </span>
      <ChevronRight className={`size-5 text-muted-foreground transition group-hover:translate-x-0.5 ${language === "ar" ? "rotate-180" : ""}`} aria-hidden="true" />
      <Progress value={percentage} aria-label={t.serviceLimit} className="col-start-2 col-end-4 h-1.5" />
    </Link>
  );

  const missionBoard = (
    <section id="missions" aria-labelledby="missions-title" className="scroll-mt-24">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{t.pageEyebrow}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="missions-title" className="text-2xl font-black leading-tight tracking-tight">{isBuyer ? t.nextActions : t.requests}</h2>
            <Badge variant="secondary" className="h-7 rounded-full px-2.5 text-xs font-medium text-muted-foreground">
              {visible.length} {visible.length === 1 ? t.missionSingular : t.missionPlural}
            </Badge>
          </div>
        </div>
        <Tabs value={filter} onValueChange={setFilter} className="w-full xl:w-auto">
          <TabsList className="grid h-[3.25rem] w-full grid-cols-3 rounded-xl p-1 xl:min-w-[22rem]">
            <TabsTrigger value="active" className="min-h-11 rounded-lg px-2 sm:px-4">{t.active}</TabsTrigger>
            <TabsTrigger value="completed" className="min-h-11 rounded-lg px-2 sm:px-4">{t.completed}</TabsTrigger>
            <TabsTrigger value="cancelled" className="min-h-11 rounded-lg px-2 sm:px-4">{t.cancelled}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((task) => {
          const canWork = currentUser.role === "admin" || task.assignee_id === currentUser.id;
          return <article key={task.id} className={`relative overflow-hidden rounded-[1.4rem] border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-xl sm:p-5 ${task.priority === "urgent" && task.status !== "completed" ? "border-[#ff9f43]/60" : "border-border"}`}>
            {task.priority === "urgent" && <span className="absolute inset-x-0 top-0 h-1 bg-[#ff9f43]" />}
            <div className="flex items-start justify-between gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-xl">{templates.find((item) => item.id === task.template_id)?.emoji ?? "✨"}</div><div className="flex flex-wrap justify-end gap-1.5"><Badge variant="secondary">{task.scope === "personal" ? t.personal : t.family}</Badge><Badge variant={task.status === "completed" ? "default" : "outline"}>{statusLabels[task.status]}</Badge></div></div>
            <h3 className="mt-3 text-lg font-bold">{task.title}</h3>{task.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.description}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-muted/55 p-3"><span className="block text-xs text-muted-foreground">{t.requestedBy}</span><strong>{task.creator_name}</strong></div><div className="rounded-xl bg-muted/55 p-3"><span className="block text-xs text-muted-foreground">{t.price}</span><strong className="text-primary">{money(task.reward_cents)}</strong></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">{task.deadline && <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" />{new Date(task.deadline).toLocaleDateString(locale)}</span>}{task.recurrence !== "none" && <span className="inline-flex items-center gap-1"><Repeat2 className="size-3.5" />{task.recurrence === "weekly" ? t.everyWeek : t.everyMonth}</span>}</div>
            {(task.status === "pending" || task.status === "in_progress") && <div className="mt-4 flex gap-2">
              {canWork && task.status === "pending" && <Button className="min-h-11 flex-1 rounded-xl" variant="outline" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "in_progress" }, t.taskStarted)}><Play /> {t.start}</Button>}
              {canWork && <Button className="min-h-11 flex-1 rounded-xl" disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "completed" }, t.taskCompleted)}><CheckCircle2 /> {t.finish}</Button>}
              {(currentUser.role === "admin" || task.creator_id === currentUser.id) && <Button size="icon" variant="ghost" className="size-11 shrink-0 rounded-xl text-destructive" aria-label={`${t.cancelMission}: ${task.title}`} disabled={busy} onClick={() => void act({ action: "update_task_status", taskId: task.id, status: "cancelled" }, t.taskCancelled)}><Trash2 /></Button>}
            </div>}
          </article>;
        })}
        {!visible.length && <div className="md:col-span-2 xl:col-span-3 rounded-[1.4rem] border border-dashed border-primary/30 bg-primary/[0.035] px-5 py-7 text-center"><WashingMachine className="mx-auto size-9 text-primary" aria-hidden="true"/><p className="mt-2 font-semibold">{emptyTitle}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{emptyDescription}</p></div>}
      </div>
    </section>
  );

  const catalog = (
    <section id="services-catalog" aria-labelledby="catalog-title" className="scroll-mt-24">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{t.catalog}</p>
        <h2 id="catalog-title" className="mt-0.5 text-2xl font-black tracking-tight">{isBuyer ? t.buyerCatalogTitle : scopeTitle}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{isBuyer ? t.buyerCatalogDescription : scopeDescription}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {visibleTemplates.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => openService(service)}
            className="group min-h-44 overflow-hidden rounded-[1.4rem] border border-border bg-card text-start shadow-[0_12px_35px_rgba(0,0,0,.06)] outline-none transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_18px_50px_rgba(0,0,0,.11)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={`${service.title}, ${money(service.price)}, ${t.viewDetails}`}
          >
            <div className={`relative grid aspect-[1.45] place-items-center overflow-hidden bg-gradient-to-br ${service.gradient}`}>
              <span className="absolute -end-8 -top-8 size-24 rounded-full bg-white/35 blur-xl dark:bg-white/5" />
              <span className="relative text-5xl drop-shadow-lg transition duration-300 group-hover:scale-110 sm:text-7xl" aria-hidden="true">{service.emoji}</span>
              <Badge className="absolute end-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-card/90 px-2 text-[10px] text-foreground shadow-sm hover:bg-card/90 sm:end-3 sm:top-3 sm:text-xs">{service.duration}</Badge>
            </div>
            <div className="p-3 sm:p-4">
              <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 sm:text-base">{service.title}</h3>
              <div className="mt-2 flex items-end justify-between gap-1.5">
                <div className="min-w-0"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{service.scope === "family" ? t.family : t.personal}</p><p className="whitespace-nowrap text-base font-black text-primary sm:text-xl">{service.id.endsWith("_custom") ? `${t.from} ` : ""}{money(service.price)}</p></div>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition group-hover:translate-x-0.5" aria-hidden="true"><ChevronRight className={`size-4 ${language === "ar" ? "rotate-180" : ""}`} /></span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );

  const scopePicker = (
    <div className="grid grid-cols-2 rounded-2xl bg-muted p-1" role="group" aria-label={t.scopeLabel}>
      <Button variant={catalogScope === "family" ? "default" : "ghost"} className="min-h-11 rounded-xl" aria-pressed={catalogScope === "family"} onClick={() => selectCatalogScope("family")}>{t.family}</Button>
      <Button variant={catalogScope === "personal" ? "default" : "ghost"} className="min-h-11 rounded-xl" aria-pressed={catalogScope === "personal"} onClick={() => selectCatalogScope("personal")}>{t.personal}</Button>
    </div>
  );

  return (
    <main dir={direction} className="min-h-screen overflow-x-clip bg-background pb-20 text-foreground">
      <Toaster theme={theme} position="top-center" richColors />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 px-3 py-2 backdrop-blur-xl sm:px-8 sm:py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-2 sm:gap-3">
          <Link href={rolePath(currentUser.role)} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-sm font-semibold outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-3" aria-label={t.workspace}><ArrowLeft className={`size-4 ${language === "ar" ? "rotate-180" : ""}`} aria-hidden="true" /><span>{t.workspace}</span></Link>
          <Image src="/icons/icon-192.png" width={34} height={34} className="hidden rounded-lg sm:block" alt="" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold sm:text-base">{t.pageName}</p><p className="hidden text-xs text-muted-foreground sm:block">{t.pageEyebrow}</p></div>
          <Button size="icon" variant="outline" className="size-11 shrink-0 rounded-xl" onClick={toggleTheme} aria-label={theme === "dark" ? (language === "ar" ? "تفعيل الوضع الفاتح" : language === "en" ? "Use light theme" : "Activer le thème clair") : (language === "ar" ? "تفعيل الوضع الداكن" : language === "en" ? "Use dark theme" : "Activer le thème sombre")}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-3 py-4 sm:px-8 sm:py-7">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{t.pageEyebrow}</p>
          <h1 className="mt-0.5 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{isBuyer ? t.buyerTitle : t.requesterTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">{isBuyer ? t.buyerDescription : t.requesterDescription}</p>
        </div>

        {isBuyer ? <div className="space-y-6">{missionBoard}<div className="space-y-5">{scopePicker}{planSummary}{catalog}</div></div> : <div className="space-y-7">{scopePicker}{planSummary}{catalog}{missionBoard}</div>}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir={direction} className="max-h-[94svh] overflow-y-auto rounded-[1.75rem] p-0 sm:max-w-2xl">
          <DialogHeader className="sr-only"><DialogTitle>{selectedTemplate.title}</DialogTitle><DialogDescription>{t.dialogDescription}</DialogDescription></DialogHeader>
          <div className={`relative grid min-h-44 place-items-center overflow-hidden rounded-t-[1.7rem] bg-gradient-to-br ${selectedTemplate.gradient}`}>
            <span className="absolute -end-12 -top-12 size-44 rounded-full bg-white/40 blur-2xl dark:bg-white/5" />
            <span className="relative text-8xl drop-shadow-xl" aria-hidden="true">{selectedTemplate.emoji}</span>
            <Badge className="absolute start-4 top-4 rounded-full bg-card/90 text-foreground shadow-sm hover:bg-card/90"><Clock3 className="size-3.5" /> {selectedTemplate.duration}</Badge>
          </div>
          <div className="space-y-6 p-5 pt-1 sm:p-7 sm:pt-2">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{selectedTemplate.scope === "family" ? t.familyService : t.personalService}</p><h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{selectedTemplate.title}</h2></div>
              <div className="shrink-0 text-end"><p className="text-xs text-muted-foreground">{t.servicePrice}</p><p className="text-2xl font-black text-primary">{selectedTemplate.id.endsWith("_custom") ? `${t.from} ` : ""}{money(selectedTemplate.price)}</p></div>
            </div>

            <p className="leading-7 text-muted-foreground">{selectedTemplate.description}</p>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <div className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck className="size-5 text-primary" /> {isBuyer ? t.whatYouWillDo : `${t.whatBuyerWillDo} · ${buyerName}`}</div>
              <ol className="space-y-2.5">{selectedTemplate.steps.map((step, index) => <li key={step} className="flex items-start gap-3 text-sm"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-black text-primary">{index + 1}</span><span className="pt-0.5">{step}</span></li>)}</ol>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {selectedTemplate.id.endsWith("_custom") && <div className="sm:col-span-2"><Label htmlFor="task-title">{t.serviceName}</Label><Input id="task-title" className="mt-1.5 h-12 rounded-xl" placeholder={selectedTemplate.scope === "family" ? t.familyNameExample : t.personalNameExample} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>}
              <div className="sm:col-span-2"><Label htmlFor="task-description">{isBuyer ? t.instructionsSelf : t.instructionsBuyer}</Label><Textarea id="task-description" className="mt-1.5 min-h-24 rounded-xl" placeholder={isBuyer ? t.instructionsSelfPlaceholder : t.instructionsBuyerPlaceholder} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
              <div><Label>{isBuyer ? t.assignedToYou : t.completedBy}</Label><div className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-border bg-muted/45 px-3"><span className="grid size-7 place-items-center rounded-lg bg-primary/12 text-xs font-black text-primary">{data.users.find((user) => String(user.id) === form.assigneeId)?.initials ?? buyerInitials}</span><strong>{data.users.find((user) => String(user.id) === form.assigneeId)?.name ?? buyerName}</strong></div></div>
              {selectedTemplate.id.endsWith("_custom") ? <div><Label htmlFor="reward">{t.proposedPrice}</Label><div className="relative mt-1.5"><CircleDollarSign className="absolute start-3 top-3.5 size-5 text-muted-foreground"/><Input id="reward" type="number" min="2" max="49" step="0.5" className="h-12 rounded-xl ps-10" value={form.reward} onChange={(event) => setForm({ ...form, reward: event.target.value })}/></div></div> : <div><Label>{t.fixedPrice}</Label><div className="mt-1.5 flex h-12 items-center rounded-xl border border-border bg-muted/45 px-4 font-black text-primary">{money(selectedTemplate.price)}</div></div>}
              <div><Label htmlFor="deadline">{t.desiredDate}</Label><Input id="deadline" type="datetime-local" className="mt-1.5 h-12 rounded-xl" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })}/></div>
              <div><Label>{t.priority}</Label><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">{t.normal}</SelectItem><SelectItem value="urgent"><span className="inline-flex items-center gap-2"><Flame className="size-4"/>{t.urgent}</span></SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2"><Label>{t.recurrence}</Label><Select value={form.recurrence} onValueChange={(value) => setForm({ ...form, recurrence: value })}><SelectTrigger className="mt-1.5 h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t.once}</SelectItem><SelectItem value="weekly" disabled={selectedPlan === "free"}>{t.everyWeek} {selectedPlan === "free" && `— ${t.plusRequired}`}</SelectItem><SelectItem value="monthly" disabled={selectedPlan === "free"}>{t.everyMonth} {selectedPlan === "free" && `— ${t.plusRequired}`}</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 border-t border-border bg-card/95 p-4 backdrop-blur sm:p-5">
            <Button className="h-12 w-full rounded-xl" disabled={busy || !form.title.trim() || !form.assigneeId || Number(form.reward) < 2 || Number(form.reward) > 49} onClick={async () => { const ok = await act({ action: "create_task", scope: form.scope, templateId: form.templateId, title: form.title, description: form.description, assigneeId: Number(form.assigneeId), rewardCents: Math.round(Number(form.reward) * 100), priority: form.priority, deadline: form.deadline, recurrence: form.recurrence }, isBuyer ? t.missionCreated : selectedTemplate.scope === "family" ? t.familyRequested : t.personalRequested); if (ok) setOpen(false); }}><Sparkles /> {isBuyer ? t.createMission : t.requestService} · {money(Math.round(Number(form.reward) * 100))}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
