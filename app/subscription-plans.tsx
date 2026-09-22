"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgeCheck, BellRing, Check, CircleX, Clock3, Crown, Gift, History,
  Loader2, Moon, PiggyBank, ReceiptText, ShoppingBasket, Sparkles, Sun, TrendingDown, TrendingUp, Upload, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useFamilyTheme } from "@/hooks/use-family-theme";
import type { FamilySessionUser } from "@/lib/family-auth";

type Plan = "free" | "plus" | "pro";
type Payment = { id: string; user_id: number; user_name: string; scope: "family" | "personal"; plan: "plus" | "pro"; amount_cents: number; status: "pending" | "confirmed" | "rejected"; request_type?: "payment" | "trial"; created_at: string; proof_key?: string | null; proof_name?: string | null };
type Membership = { plan: "plus" | "pro"; ends_at: string; source: string } | null;
type InsightData = {
  locked: boolean;
  expensive: Array<{ name: string; current_cents: number; average_cents: number; increase_percent: number }>;
  predictions: Array<{ name: string; next_date: string; purchases: number }>;
  savings: Array<{ name: string; possible_cents: number; best_price_cents: number }>;
};
type Data = {
  plan: Plan; usage: number; limit: number | null; familyFundCents: number; familyTargetPlan: "plus" | "pro";
  familyPlan: Plan; personalPlan: Plan; familyUsage: number; personalUsage: number;
  familyLimit: number | null; personalLimit: number | null;
  familyMembership: Membership; personalMembership: Membership; payments: Payment[];
  votes: Array<{ user_id: number; plan: "plus" | "pro" }>; trialAvailable: boolean; insights: InsightData;
  unlocked?: boolean; error?: string;
};

const money = (cents: number) => `${(cents / 100).toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH`;
const planPrice = { plus: 1500, pro: 2900 } as const;
const rolePath = (role: FamilySessionUser["role"]) => role === "admin" ? "/admin" : role === "delivery" ? "/livreur" : "/membre";

const planCards = [
  { id: "free" as const, name: "Gratuit", price: 0, subtitle: "Pour essayer simplement", features: ["Courses et dépenses", "2 services / mois", "Frais livraison 0,50 DH"] },
  { id: "plus" as const, name: "Plus", price: 1500, subtitle: "Pour être mieux organisé", features: ["15 services / mois", "Services répétitifs", "Rappels intelligents", "Frais livraison 0,50 DH"] },
  { id: "pro" as const, name: "Pro", price: 2900, subtitle: "Pour tout débloquer", features: ["Services illimités", "Livraison sans frais", "Alertes hausse de prix", "Prédictions et économies"] },
];

export function SubscriptionPlans({ currentUser }: { currentUser: FamilySessionUser }) {
  const { theme, toggleTheme } = useFamilyTheme();
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [amount, setAmount] = useState("5");
  const [targetPlan, setTargetPlan] = useState<"plus" | "pro">("plus");
  const [subscriptionScope, setSubscriptionScope] = useState<"family" | "personal">("family");
  const [celebrate, setCelebrate] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [directEntry, setDirectEntry] = useState(false);
  const [proofBusy, setProofBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/services", { cache: "no-store" });
      const payload = await response.json() as Data;
      if (!response.ok) throw new Error(payload.error || "Chargement impossible.");
      setData(payload); setTargetPlan(payload.familyTargetPlan); setReferenceTime(Date.now());
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Erreur."); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDirectEntry(document.cookie.split("; ").some((entry) => entry === "family_direct_entry=1"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const updateDirectEntry = (enabled: boolean) => {
    setDirectEntry(enabled);
    document.cookie = enabled
      ? "family_direct_entry=1; Path=/; Max-Age=31536000; SameSite=Lax"
      : "family_direct_entry=; Path=/; Max-Age=0; SameSite=Lax";
    toast.success(enabled ? "Votre espace s’ouvrira directement la prochaine fois." : "Les forfaits resteront votre première page.");
  };

  const uploadProof = async (paymentId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Le justificatif ne doit pas dépasser 5 Mo.");
      return;
    }
    try {
      setProofBusy(paymentId);
      const formData = new FormData();
      formData.set("paymentId", paymentId);
      formData.set("proof", file);
      const response = await fetch("/api/services/proofs", { method: "POST", body: formData });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Envoi impossible.");
      await load();
      toast.success("Justificatif envoyé au propriétaire de la famille.");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Envoi impossible.");
    } finally {
      setProofBusy("");
    }
  };

  const act = async (body: Record<string, unknown>, success: string) => {
    setBusy(String(body.action ?? "action"));
    try {
      const response = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as Data;
      if (!response.ok) throw new Error(payload.error || "Action impossible.");
      setData(payload); setTargetPlan(payload.familyTargetPlan);
      toast.success(
        body.action === "confirm_payment"
          ? payload.unlocked
            ? "Paiement confirmé et forfait activé."
            : "Paiement confirmé. Le pot familial continue jusqu’au montant requis."
          : success,
      );
      if (payload.unlocked) { setCelebrate(true); window.setTimeout(() => setCelebrate(false), 2600); }
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Erreur."); }
    finally { setBusy(""); }
  };

  const goal = planPrice[targetPlan];
  const progress = data ? Math.min(100, Math.round((data.familyFundCents / goal) * 100)) : 0;
  const confirmedContributions = useMemo(() => data?.payments.filter((item) => item.scope === "family" && item.status === "confirmed") ?? [], [data]);
  const pending = useMemo(() => data?.payments.filter((item) => item.status === "pending") ?? [], [data]);
  const ownPending = pending.filter((item) => item.user_id === currentUser.id);
  const ownPaymentPending = ownPending.filter((item) => item.request_type !== "trial");
  const ownTrialPending = ownPending.find((item) => item.request_type === "trial") ?? null;
  const ownPayments = data?.payments.filter((item) => item.user_id === currentUser.id) ?? [];
  const latestOwnDecision = data?.payments.find((item) => item.user_id === currentUser.id && item.status !== "pending") ?? null;
  const votes = { plus: data?.votes.filter((vote) => vote.plan === "plus").length ?? 0, pro: data?.votes.filter((vote) => vote.plan === "pro").length ?? 0 };
  const selectedScopePlan = subscriptionScope === "family" ? data?.familyPlan : data?.personalPlan;
  const selectedScopeUsage = subscriptionScope === "family" ? data?.familyUsage : data?.personalUsage;
  const selectedScopeLimit = subscriptionScope === "family" ? data?.familyLimit : data?.personalLimit;
  const selectedMembership = subscriptionScope === "family" ? data?.familyMembership : data?.personalMembership;
  const membershipDaysRemaining = selectedMembership && referenceTime
    ? Math.ceil((new Date(selectedMembership.ends_at).getTime() - referenceTime) / 86_400_000)
    : null;

  if (!data) return <main className="grid min-h-screen place-items-center bg-background"><Loader2 className="size-8 animate-spin text-primary" /></main>;

  return (
    <main className="min-h-screen overflow-hidden bg-background pb-16 text-foreground">
      <Toaster theme={theme} position="top-center" richColors />
      {celebrate && <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-primary/10 backdrop-blur-sm"><div className="animate-in zoom-in-50 rounded-[2rem] border border-primary/30 bg-card p-10 text-center shadow-2xl"><Gift className="mx-auto size-14 animate-bounce text-primary"/><p className="mt-4 text-2xl font-black">Forfait débloqué !</p><p className="text-muted-foreground">Votre nouveau forfait est maintenant actif.</p></div></div>}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3"><Link href={rolePath(currentUser.role)}><Button size="icon" variant="outline" className="rounded-xl" aria-label="Retour à mon espace"><ArrowLeft /></Button></Link><Image src="/icons/icon-192.png" width={40} height={40} className="rounded-xl" alt="Logo Dépenses famille"/><div className="min-w-0 flex-1"><p className="truncate font-bold">Forfaits famille</p><p className="hidden text-xs text-muted-foreground sm:block">Choisissez ensemble, ou seulement pour vous.</p></div><Link href="/services"><Button variant="outline" className="rounded-xl" aria-label="Ouvrir les services"><Sparkles/><span className="hidden sm:inline">Missions</span></Button></Link><Button size="icon" variant="outline" className="rounded-xl" onClick={toggleTheme} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"}>{theme === "dark" ? <Sun/> : <Moon/>}</Button></div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-3xl text-center"><Badge className="rounded-full bg-[#ffad42] px-4 py-1 text-[#30200b] hover:bg-[#ffad42]">PLUS DE TEMPS, MOINS DE DÉPENSES</Badge><h1 className="mt-5 text-4xl font-black tracking-[-0.055em] sm:text-6xl">Un forfait pour la maison. Un autre pour vous.</h1><p className="mx-auto mt-4 max-w-2xl text-muted-foreground">Choisissez le côté familial pour les besoins communs, ou le côté personnel pour commander vos propres services.</p><div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row"><Link href={rolePath(currentUser.role)}><Button size="lg" className="h-12 rounded-2xl px-6"><ShoppingBasket/>Continuer vers mon espace</Button></Link><label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm"><Switch checked={directEntry} onCheckedChange={updateDirectEntry} aria-label="Ouvrir directement mon espace à la prochaine connexion"/><span className="text-start">Ouvrir directement la prochaine fois</span></label></div></div>

        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-2 rounded-[1.4rem] border border-border bg-card p-2 shadow-sm min-[430px]:grid-cols-2">
          <Button className="h-auto rounded-2xl py-4" variant={subscriptionScope === "family" ? "default" : "ghost"} onClick={() => setSubscriptionScope("family")}><Users/><span className="text-start"><strong className="block">Forfait familial</strong><small className="font-normal opacity-75">Payé ensemble, partagé par tous</small></span></Button>
          <Button className="h-auto rounded-2xl py-4" variant={subscriptionScope === "personal" ? "default" : "ghost"} onClick={() => setSubscriptionScope("personal")}><Crown/><span className="text-start"><strong className="block">Forfait personnel</strong><small className="font-normal opacity-75">Payé et utilisé par vous</small></span></Button>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {planCards.map((card) => <article key={card.id} className={`relative rounded-[2rem] border p-6 ${card.id === "pro" ? "border-[#f3a72f]/70 bg-gradient-to-b from-[#f3a72f]/12 to-card shadow-[0_24px_80px_rgba(243,167,47,.12)]" : "border-border bg-card"}`}>
            {card.id === "pro" && <Badge className="absolute -top-3 start-6 bg-[#f3a72f] text-[#2d1e07] hover:bg-[#f3a72f]"><Crown/>Meilleure valeur</Badge>}
            <div className="flex items-center justify-between"><h2 className="text-2xl font-black">{card.name}</h2>{selectedScopePlan === card.id && <BadgeCheck className="text-primary"/>}</div><p className="mt-1 text-sm text-muted-foreground">{card.subtitle}</p><p className="mt-6 text-4xl font-black">{money(card.price)}<span className="text-sm font-medium text-muted-foreground"> / mois</span></p>
            <ul className="mt-6 space-y-3">{card.features.map((feature) => <li key={feature} className="flex items-center gap-2 text-sm"><Check className="size-4 text-primary"/>{feature}</li>)}</ul>
            {card.id === "free" ? <Button className="mt-7 w-full rounded-xl" variant="outline" disabled>Inclus</Button> : subscriptionScope === "family" ? <Button className="mt-7 w-full rounded-xl" variant={card.id === "pro" ? "default" : "outline"} disabled={Boolean(busy)} onClick={() => { setTargetPlan(card.id); document.getElementById("family-fund")?.scrollIntoView({ behavior: "smooth" }); }}>Financer en famille</Button> : <Button className="mt-7 w-full rounded-xl" variant={card.id === "pro" ? "default" : "outline"} disabled={Boolean(busy)} onClick={() => void act({ action: "request_personal_plan", plan: card.id }, `Demande ${card.name} envoyée à l’admin.`)}>Payer pour moi uniquement</Button>}
          </article>)}
        </div>

        {ownPending.length > 0 && <div className="mt-5 rounded-2xl border border-[#f3a72f]/35 bg-[#f3a72f]/10 p-4"><div className="flex items-center gap-3"><Clock3 className="size-5 shrink-0 text-[#c37a00]"/><p className="text-sm"><strong>{ownPending.length} demande{ownPending.length > 1 ? "s" : ""} en attente.</strong> {ownTrialPending ? "Votre essai commencera seulement après l’approbation du propriétaire de la famille." : "Le propriétaire de la famille activera le forfait après réception de l’argent."}</p></div>{ownPaymentPending.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{ownPaymentPending.map((payment) => <label key={payment.id} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#f3a72f]/30 bg-card px-3 py-2 text-xs font-semibold"><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={proofBusy === payment.id} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadProof(payment.id, file); event.currentTarget.value = ""; }}/>{proofBusy === payment.id ? <Loader2 className="size-4 animate-spin"/> : payment.proof_key ? <ReceiptText className="size-4 text-primary"/> : <Upload className="size-4"/>}{payment.proof_key ? "Remplacer le justificatif" : "Ajouter un justificatif"}</label>)}</div>}</div>}

        {latestOwnDecision && <div className={`mt-5 flex items-center gap-3 rounded-2xl border p-4 ${latestOwnDecision.status === "confirmed" ? "border-primary/30 bg-primary/10" : "border-destructive/30 bg-destructive/10"}`}>{latestOwnDecision.status === "confirmed" ? <BadgeCheck className="size-5 shrink-0 text-primary"/> : <CircleX className="size-5 shrink-0 text-destructive"/>}<p className="text-sm"><strong>{latestOwnDecision.status === "confirmed" ? latestOwnDecision.request_type === "trial" ? "Essai approuvé." : "Paiement accepté." : "Demande refusée."}</strong> {latestOwnDecision.status === "confirmed" ? latestOwnDecision.request_type === "trial" ? "Votre essai personnel Pro de 7 jours est maintenant actif." : `Votre demande ${latestOwnDecision.plan.toUpperCase()} a été traitée.` : "Contactez le propriétaire de votre famille si vous souhaitez refaire la demande."}</p></div>}

        {(data.trialAvailable || ownTrialPending) && data.personalPlan !== "pro" && <article className="mt-5 flex flex-col items-start justify-between gap-4 rounded-[1.6rem] border border-primary/25 bg-primary/8 p-5 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><Gift className="mt-1 size-7 text-primary"/><div><h3 className="font-bold">Essayez le forfait personnel Pro pendant 7 jours</h3><p className="text-sm text-muted-foreground">Aucun paiement ni carte bancaire. L’essai commence après l’approbation du propriétaire de la famille.</p></div></div><Button className="w-full rounded-xl sm:w-auto" disabled={Boolean(busy) || Boolean(ownTrialPending)} onClick={() => void act({ action: "start_trial" }, "Demande d’essai envoyée au propriétaire de la famille.")}>{ownTrialPending ? "Approbation en attente" : "Demander mon essai"}</Button></article>}

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <article id="family-fund" className="scroll-mt-24 rounded-[2rem] border border-border bg-card p-5 sm:p-7">
            <div className="flex items-start gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><Users/></span><div><h2 className="text-2xl font-black">Pot d’abonnement familial</h2><p className="mt-1 text-sm text-muted-foreground">Chacun donne ce qu’il peut. Le propriétaire de la famille confirme l’argent reçu.</p></div></div>
            <div className="mt-7 rounded-2xl bg-muted/45 p-5"><div className="flex items-end justify-between"><div><p className="text-xs text-muted-foreground">Collecté pour {targetPlan === "pro" ? "Pro" : "Plus"}</p><p className="mt-1 text-3xl font-black">{money(data.familyFundCents)}</p></div><strong>{progress}%</strong></div><Progress value={progress} className="mt-4 h-3"/><p className="mt-2 text-xs text-muted-foreground">Reste {money(Math.max(0, goal - data.familyFundCents))}. Le surplus reste pour le mois prochain.</p></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><Button variant={targetPlan === "plus" ? "default" : "outline"} className="h-auto rounded-xl py-3" onClick={() => { setTargetPlan("plus"); void act({ action: "vote_plan", plan: "plus" }, "Vote Plus enregistré."); }}><span><strong className="block">Plus · 15 DH</strong><small>{votes.plus} vote(s)</small></span></Button><Button variant={targetPlan === "pro" ? "default" : "outline"} className="h-auto rounded-xl py-3" onClick={() => { setTargetPlan("pro"); void act({ action: "vote_plan", plan: "pro" }, "Vote Pro enregistré."); }}><span><strong className="block">Pro · 29 DH</strong><small>{votes.pro} vote(s)</small></span></Button></div>
            <div className="mt-5 flex gap-2"><div className="relative flex-1"><PiggyBank className="absolute start-3 top-3.5 size-5 text-muted-foreground"/><Input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12 rounded-xl ps-10 pe-12"/><span className="absolute end-3 top-3.5 text-sm font-bold">DH</span></div><Button className="h-12 rounded-xl px-5" disabled={Boolean(busy) || Number(amount) <= 0} onClick={() => void act({ action: "contribute_family", plan: targetPlan, amountCents: Math.round(Number(amount) * 100) }, "Contribution envoyée au propriétaire de la famille.")}>Participer</Button></div>
            <div className="mt-6"><h3 className="text-sm font-bold">Contributions confirmées</h3><div className="mt-3 space-y-2">{confirmedContributions.slice(0, 8).map((payment) => <div key={payment.id} className="flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2"><span className="grid size-8 place-items-center rounded-full bg-primary/12 text-xs font-black text-primary">{payment.user_name.slice(0,2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm">{payment.user_name}</span><strong className="text-primary">+{money(payment.amount_cents)}</strong></div>)}{!confirmedContributions.length && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Aucune contribution confirmée.</p>}</div></div>
          </article>

          <div className="space-y-5">
            <article className="rounded-[2rem] border border-border bg-card p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{subscriptionScope === "family" ? "Forfait de la famille" : "Votre forfait personnel"}</p><h2 className="mt-1 text-3xl font-black uppercase">{selectedScopePlan}</h2></div><Crown className="size-10 text-[#f3a72f]"/></div>{selectedMembership && <p className={`mt-4 rounded-xl p-3 text-sm ${membershipDaysRemaining !== null && membershipDaysRemaining <= 7 ? "border border-[#f3a72f]/35 bg-[#f3a72f]/10 text-[#9a5b00] dark:text-[#ffbd57]" : "bg-muted/45"}`}><Clock3 className="me-2 inline size-4"/>Actif jusqu’au {new Date(selectedMembership.ends_at).toLocaleDateString("fr-MA")}{membershipDaysRemaining !== null && membershipDaysRemaining <= 7 && <strong> · Expire dans {Math.max(0, membershipDaysRemaining)} jour{membershipDaysRemaining === 1 ? "" : "s"}</strong>}</p>}<div className="mt-5 flex items-center justify-between text-sm"><span>Services ce mois</span><strong>{selectedScopeUsage} / {selectedScopeLimit ?? "∞"}</strong></div><Progress value={selectedScopeLimit ? Math.min(100, (selectedScopeUsage ?? 0) / selectedScopeLimit * 100) : 12} className="mt-2"/></article>
            {currentUser.role === "admin" && <article className="rounded-[2rem] border border-[#f3a72f]/30 bg-card p-5 sm:p-6"><h2 className="font-bold">Demandes à approuver</h2><p className="mt-1 text-xs text-muted-foreground">Les essais commencent seulement après votre accord.</p><div className="mt-4 space-y-3">{pending.map((payment) => <div key={payment.id} className="rounded-xl bg-muted/45 p-3"><div className="flex items-center justify-between gap-2"><div><strong className="text-sm">{payment.user_name}</strong><p className="text-xs text-muted-foreground">{payment.request_type === "trial" ? "Essai personnel Pro · 7 jours" : `${payment.scope === "family" ? "Pot familial" : "Compte personnel"} · ${payment.plan}`}</p></div><strong>{payment.request_type === "trial" ? "GRATUIT" : money(payment.amount_cents)}</strong></div><div className="mt-3 grid grid-cols-2 gap-2"><Button size="sm" className="rounded-lg" disabled={Boolean(busy)} onClick={() => void act({ action: "confirm_payment", paymentId: payment.id }, payment.request_type === "trial" ? "Essai approuvé et activé." : "Paiement confirmé.")}>{payment.request_type === "trial" ? "Approuver" : "Confirmer"}</Button><Button size="sm" variant="outline" className="rounded-lg" disabled={Boolean(busy)} onClick={() => void act({ action: "reject_payment", paymentId: payment.id }, "Demande refusée.")}>Refuser</Button></div></div>)}{!pending.length && <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Rien à confirmer.</p>}</div></article>}
          </div>
        </div>

        <section id="subscription-history" className="mt-10 scroll-mt-24 rounded-[2rem] border border-border bg-card p-5 sm:p-7">
          <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><History/></span><div><h2 className="text-xl font-black">Historique de mes forfaits</h2><p className="mt-1 text-sm text-muted-foreground">Demandes, contributions, décisions et justificatifs restent disponibles ici.</p></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {ownPayments.length ? ownPayments.map((payment) => <article key={payment.id} className="rounded-2xl border border-border bg-muted/35 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="uppercase">{payment.plan}</strong><p className="mt-1 text-xs text-muted-foreground">{payment.request_type === "trial" ? "Essai personnel · 7 jours" : payment.scope === "family" ? "Contribution familiale" : "Forfait personnel"} · {new Date(payment.created_at).toLocaleDateString("fr-MA")}</p></div><Badge variant={payment.status === "confirmed" ? "default" : "outline"} className={payment.status === "rejected" ? "border-destructive/30 text-destructive" : ""}>{payment.status === "pending" ? "En attente" : payment.status === "confirmed" ? "Confirmé" : "Refusé"}</Badge></div><div className="mt-3 flex items-center justify-between text-sm"><strong>{payment.request_type === "trial" ? "GRATUIT" : money(payment.amount_cents)}</strong>{payment.proof_key && <a href={`/api/services/proofs?paymentId=${encodeURIComponent(payment.id)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><ReceiptText className="size-4"/>Voir le justificatif</a>}</div></article>) : <p className="md:col-span-2 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucun historique pour le moment.</p>}
          </div>
        </section>

        <section className="mt-10"><div className="mb-5 flex items-end justify-between"><div><Badge variant="outline" className="mb-2 border-[#f3a72f]/40 text-[#c37a00]"><Sparkles/>PRO</Badge><h2 className="text-2xl font-black">Assistant économies</h2><p className="text-sm text-muted-foreground">Vos achats deviennent des décisions utiles.</p></div></div>
          {data.insights.locked ? <div className="relative overflow-hidden rounded-[2rem] border border-[#f3a72f]/35 bg-card p-8 text-center"><div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#f3a72f]/8 via-transparent to-primary/8"/><Crown className="relative mx-auto size-10 text-[#f3a72f]"/><h3 className="relative mt-3 text-xl font-black">Débloquez votre analyse personnelle</h3><p className="relative mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Pro repère les hausses, prévoit vos prochains besoins et montre où économiser.</p><Button className="relative mt-5 rounded-xl" onClick={() => void act({ action: "request_personal_plan", plan: "pro" }, "Demande Pro envoyée.")}>Débloquer avec Pro</Button></div> : <div className="grid gap-4 md:grid-cols-3">
            <InsightCard icon={<TrendingUp/>} title="Prix en hausse" empty="Aucune hausse importante." items={data.insights.expensive.map((item) => `${item.name} · +${item.increase_percent}%`)} />
            <InsightCard icon={<BellRing/>} title="Bientôt nécessaire" empty="Plus d’historique est nécessaire." items={data.insights.predictions.map((item) => `${item.name} · vers le ${new Date(item.next_date).toLocaleDateString("fr-MA")}`)} />
            <InsightCard icon={<TrendingDown/>} title="Économies possibles" empty="Vos prix sont déjà bien optimisés." items={data.insights.savings.map((item) => `${item.name} · jusqu’à ${money(item.possible_cents)}`)} />
          </div>}
        </section>
      </section>
    </main>
  );
}

function InsightCard({ icon, title, items, empty }: { icon: React.ReactNode; title: string; items: string[]; empty: string }) {
  return <article className="rounded-[1.6rem] border border-border bg-card p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span><h3 className="mt-4 font-bold">{title}</h3><div className="mt-3 space-y-2">{items.length ? items.map((item) => <p key={item} className="rounded-xl bg-muted/45 p-3 text-sm">{item}</p>) : <p className="text-sm text-muted-foreground">{empty}</p>}</div></article>;
}
