import { getRequestFamilyUser } from "@/lib/family-auth";
import {
  activePlanForScope,
  addDaysIso,
  effectivePlan,
  monthlyTaskUsageForScope,
  parseServicesState,
  planForTaskScope,
  PLAN_RULES,
  SERVICES_META_KEY,
  type PaidPlanId,
  type ServicesState,
} from "@/lib/family-services";
import { addMemberWalletTransaction } from "@/lib/member-wallet";
import { notifyAdminOfPlanRequest } from "@/lib/push-notifications";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { action?: string; [key: string]: unknown };
type FamilyUser = { id: number; name: string; initials: string; role: "admin" | "delivery" | "member" };

const text = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const positiveInt = (value: unknown, label: string, max = 10_000_000) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) throw new Error(`${label} invalide.`);
  return parsed;
};
const paidPlan = (value: unknown): PaidPlanId => {
  if (value !== "plus" && value !== "pro") throw new Error("Forfait invalide.");
  return value;
};

async function loadState() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("app_meta").select("value").eq("key", SERVICES_META_KEY).maybeSingle();
  throwIfSupabaseError(error);
  return parseServicesState(data?.value);
}

async function saveState(state: ServicesState) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("app_meta").upsert(
    { key: SERVICES_META_KEY, value: JSON.stringify(state) },
    { onConflict: "key" },
  );
  throwIfSupabaseError(error);
}

async function loadUsers() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("family_users")
    .select("id, name, initials, role").eq("active", true).order("name");
  throwIfSupabaseError(error);
  return (data ?? []) as FamilyUser[];
}

function maybeActivateFamilyPlan(state: ServicesState) {
  const now = new Date();
  const alreadyActive = state.memberships.some((item) => item.scope === "family" && new Date(item.starts_at) <= now && new Date(item.ends_at) > now);
  const price = PLAN_RULES[state.family_target_plan].price_cents;
  if (!alreadyActive && state.family_fund_cents >= price) {
    state.family_fund_cents -= price;
    // Personal time is never wasted: pause it by adding the family-plan month.
    for (const membership of state.memberships) {
      if (membership.scope === "personal" && new Date(membership.ends_at) > now) {
        membership.ends_at = addDaysIso(30, new Date(membership.ends_at));
      }
    }
    state.memberships.push({
      id: crypto.randomUUID(), scope: "family", member_id: null,
      plan: state.family_target_plan, starts_at: now.toISOString(), ends_at: addDaysIso(30, now), source: "fund",
    });
    return true;
  }
  return false;
}

async function buildInsights(plan: string) {
  if (plan !== "pro") return { locked: true, expensive: [], predictions: [], savings: [] };
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("cart_items")
    .select("product_id, actual_unit_price_cents, quantity_hundredths, carts!inner(status, completed_at), products!inner(name_fr, unit_price_cents)")
    .eq("purchase_status", "bought").eq("carts.status", "completed").limit(1000);
  throwIfSupabaseError(error);
  type Row = { product_id: number; actual_unit_price_cents: number; carts: { completed_at: string }; products: { name_fr: string; unit_price_cents: number } };
  const grouped = new Map<number, { name: string; current: number; prices: number[]; dates: string[] }>();
  for (const raw of (data ?? []) as unknown as Row[]) {
    const cart = Array.isArray(raw.carts) ? raw.carts[0] : raw.carts;
    const product = Array.isArray(raw.products) ? raw.products[0] : raw.products;
    if (!cart?.completed_at || !product) continue;
    const item = grouped.get(raw.product_id) ?? {
      name: product.name_fr,
      current: product.unit_price_cents,
      prices: [] as number[],
      dates: [] as string[],
    };
    item.prices.push(raw.actual_unit_price_cents);
    item.dates.push(cart.completed_at);
    grouped.set(raw.product_id, item);
  }
  const expensive: Array<{ name: string; current_cents: number; average_cents: number; increase_percent: number }> = [];
  const predictions: Array<{ name: string; next_date: string; purchases: number }> = [];
  const savings: Array<{ name: string; possible_cents: number; best_price_cents: number }> = [];
  for (const item of grouped.values()) {
    const prior = item.prices.slice(0, -1);
    if (prior.length >= 2) {
      const average = Math.round(prior.reduce((sum, price) => sum + price, 0) / prior.length);
      if (item.current > average * 1.15) expensive.push({ name: item.name, current_cents: item.current, average_cents: average, increase_percent: Math.round((item.current / average - 1) * 100) });
      const best = Math.min(...prior);
      if (item.current > best) savings.push({ name: item.name, possible_cents: item.current - best, best_price_cents: best });
    }
    const dates = [...new Set(item.dates.map((date) => date.slice(0, 10)))].sort();
    if (dates.length >= 2) {
      const intervals = dates.slice(1).map((date, index) => (new Date(date).getTime() - new Date(dates[index]).getTime()) / 86_400_000);
      const averageDays = Math.max(1, Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length));
      predictions.push({ name: item.name, next_date: addDaysIso(averageDays, new Date(dates.at(-1)!)).slice(0, 10), purchases: dates.length });
    }
  }
  return {
    locked: false,
    expensive: expensive.sort((a, b) => b.increase_percent - a.increase_percent).slice(0, 5),
    predictions: predictions.sort((a, b) => a.next_date.localeCompare(b.next_date)).slice(0, 5),
    savings: savings.sort((a, b) => b.possible_cents - a.possible_cents).slice(0, 5),
  };
}

async function responseFor(viewer: { id: number; role: string }, state: ServicesState, unlocked = false) {
  const users = await loadUsers();
  const plan = effectivePlan(state, viewer.id);
  const viewNow = new Date();
  const familyPlan = activePlanForScope(state, viewer.id, "family", viewNow);
  const personalPlan = activePlanForScope(state, viewer.id, "personal", viewNow);
  const familyUsage = monthlyTaskUsageForScope(state, viewer.id, "family", viewNow);
  const personalUsage = monthlyTaskUsageForScope(state, viewer.id, "personal", viewNow);
  const familyMembership = state.memberships.filter((item) => item.scope === "family" && new Date(item.starts_at) <= viewNow && new Date(item.ends_at) > viewNow).at(-1) ?? null;
  const personalMembership = state.memberships.filter((item) => item.scope === "personal" && item.member_id === viewer.id && new Date(item.starts_at) <= viewNow && new Date(item.ends_at) > viewNow).at(-1) ?? null;
  const visibleTasks = state.tasks.filter((task) =>
    task.scope === "family" ||
    viewer.role === "admin" ||
    task.creator_id === viewer.id ||
    task.assignee_id === viewer.id,
  );
  return {
    users, tasks: visibleTasks.slice().reverse(), plan, plans: PLAN_RULES,
    usage: familyUsage + personalUsage,
    limit: PLAN_RULES[plan].monthly_tasks,
    familyPlan,
    personalPlan,
    familyUsage,
    personalUsage,
    familyLimit: PLAN_RULES[familyPlan].monthly_tasks,
    personalLimit: PLAN_RULES[personalPlan].monthly_tasks,
    familyFundCents: state.family_fund_cents,
    familyTargetPlan: state.family_target_plan, familyMembership, personalMembership,
    payments: viewer.role === "admin"
      ? state.payments.slice().reverse()
      : state.payments.filter((payment) =>
          payment.user_id === viewer.id ||
          (payment.scope === "family" && payment.status === "confirmed"),
        ).slice().reverse().map((payment) => payment.user_id === viewer.id
          ? payment
          : { ...payment, proof_key: null, proof_name: null }),
    votes: state.votes,
    trialAvailable: !state.trial_used_by.includes(viewer.id) && !state.payments.some((payment) =>
      payment.user_id === viewer.id && payment.request_type === "trial" && payment.status === "pending"
    ),
    insights: await buildInsights(plan), unlocked,
  };
}

export async function GET(request: Request) {
  try {
    const viewer = await getRequestFamilyUser(request);
    if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
    return Response.json(await responseFor(viewer, await loadState()));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur inattendue." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await getRequestFamilyUser(request);
    if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const body = await request.json() as Body;
    const state = await loadState();
    const users = await loadUsers();
    const now = new Date();
    let unlocked = false;
    let planRequestNotification: Parameters<typeof notifyAdminOfPlanRequest>[0] | null = null;

    switch (body.action) {
      case "create_task": {
        const templateId = text(body.templateId, 40);
        const template = SERVICE_CATALOG[templateId];
        if (!template) throw new Error("Service introuvable.");
        const scope = body.scope === "personal" ? "personal" : "family";
        if (scope !== template.scope) throw new Error("Type de service invalide.");
        let creator: Pick<FamilyUser, "id" | "name"> = viewer;
        if (body.creatorMemberId !== undefined) {
          if (viewer.role !== "admin") throw new Error("Seul l’administrateur peut commander pour un membre.");
          const creatorMemberId = positiveInt(body.creatorMemberId, "Membre");
          const member = users.find((user) => user.id === creatorMemberId && user.role === "member");
          if (!member) throw new Error("Membre introuvable.");
          creator = member;
        }
        const plan = planForTaskScope(state, creator.id, scope, now);
        const usage = monthlyTaskUsageForScope(state, creator.id, scope, now);
        const limit = PLAN_RULES[plan].monthly_tasks;
        if (limit !== null && usage >= limit) throw new Error(`Limite mensuelle atteinte (${limit} services).`);
        const assignee = users.find((user) => user.role === "delivery");
        if (!assignee) throw new Error("Membre introuvable.");
        const title = text(body.title, 80);
        if (!title) throw new Error("Le nom de la mission est requis.");
        const recurrence = body.recurrence === "weekly" || body.recurrence === "monthly" ? body.recurrence : "none";
        if (recurrence !== "none" && !PLAN_RULES[plan].recurring) throw new Error("Les missions répétées nécessitent Plus ou Pro.");
        const deadlineText = text(body.deadline, 40);
        const deadline = deadlineText && !Number.isNaN(new Date(deadlineText).getTime()) ? new Date(deadlineText).toISOString() : null;
        const rewardCents = template.price_cents ?? positiveInt(body.rewardCents, "Prix", 4_900);
        if (rewardCents < 200 || rewardCents > 4_900) {
          throw new Error("Le prix doit être compris entre 2 et 49 DH.");
        }
        state.tasks.push({
          id: crypto.randomUUID(), title, description: text(body.description, 400), template_id: templateId, scope,
          creator_id: creator.id, creator_name: creator.name, assignee_id: assignee.id, assignee_name: assignee.name,
          reward_cents: rewardCents, priority: body.priority === "urgent" ? "urgent" : "normal",
          deadline, recurrence, status: "pending", created_at: now.toISOString(), started_at: null, completed_at: null,
        });
        break;
      }
      case "update_task_status": {
        const id = text(body.taskId, 80);
        const task = state.tasks.find((item) => item.id === id);
        if (!task) throw new Error("Mission introuvable.");
        const next = body.status;
        if (next === "in_progress") {
          if (viewer.role !== "admin" && task.assignee_id !== viewer.id) throw new Error("Seule la personne assignée peut commencer.");
          if (task.status !== "pending") throw new Error("Cette mission ne peut pas être démarrée.");
          task.status = "in_progress"; task.started_at = now.toISOString();
        } else if (next === "completed") {
          if (viewer.role !== "admin" && task.assignee_id !== viewer.id) throw new Error("Seule la personne assignée peut terminer.");
          if (task.status !== "pending" && task.status !== "in_progress") throw new Error("Cette mission est déjà terminée.");
          task.status = "completed"; task.completed_at = now.toISOString();
          const assignee = users.find((user) => user.id === task.assignee_id);
          if (assignee?.role === "member") await addMemberWalletTransaction(task.assignee_id, {
            id: `task-${task.id}`, type: "task", amount_cents: task.reward_cents, cart_id: null, task_id: task.id,
            created_at: now.toISOString(), actor_name: viewer.name,
          });
          const assigneePlan = planForTaskScope(state, task.creator_id, task.scope, now);
          const recurrenceLimit = PLAN_RULES[assigneePlan].monthly_tasks;
          const recurrenceAllowed = recurrenceLimit === null || monthlyTaskUsageForScope(state, task.creator_id, task.scope, now) < recurrenceLimit;
          if (task.recurrence !== "none" && recurrenceAllowed) {
            const deadline = task.deadline ? new Date(task.deadline) : now;
            if (task.recurrence === "weekly") deadline.setUTCDate(deadline.getUTCDate() + 7);
            else deadline.setUTCMonth(deadline.getUTCMonth() + 1);
            state.tasks.push({ ...task, id: crypto.randomUUID(), status: "pending", created_at: now.toISOString(), deadline: deadline.toISOString(), started_at: null, completed_at: null });
          }
        } else if (next === "cancelled") {
          if (viewer.role !== "admin" && task.creator_id !== viewer.id) throw new Error("Seul le créateur peut annuler.");
          if (task.status === "completed") throw new Error("Une mission terminée ne peut pas être annulée.");
          task.status = "cancelled";
        } else throw new Error("Statut invalide.");
        break;
      }
      case "contribute_family": {
        const amountCents = positiveInt(body.amountCents, "Montant", 100_000);
        const plan = paidPlan(body.plan);
        const paymentId = crypto.randomUUID();
        state.family_target_plan = plan;
        state.payments.push({ id: paymentId, user_id: viewer.id, user_name: viewer.name, scope: "family", plan, amount_cents: amountCents, status: "pending", created_at: now.toISOString(), confirmed_at: null });
        planRequestNotification = { paymentId, memberName: viewer.name, scope: "family", plan, amountCents };
        break;
      }
      case "request_personal_plan": {
        const plan = paidPlan(body.plan);
        if (state.payments.some((payment) => payment.scope === "personal" && payment.user_id === viewer.id && payment.plan === plan && payment.status === "pending")) {
          throw new Error("Cette demande attend déjà la confirmation de l’administrateur.");
        }
        const paymentId = crypto.randomUUID();
        const amountCents = PLAN_RULES[plan].price_cents;
        state.payments.push({ id: paymentId, user_id: viewer.id, user_name: viewer.name, scope: "personal", plan, amount_cents: amountCents, status: "pending", created_at: now.toISOString(), confirmed_at: null });
        planRequestNotification = { paymentId, memberName: viewer.name, scope: "personal", plan, amountCents };
        break;
      }
      case "vote_plan": {
        const plan = paidPlan(body.plan);
        state.votes = [...state.votes.filter((vote) => vote.user_id !== viewer.id), { user_id: viewer.id, plan, updated_at: now.toISOString() }];
        const plusVotes = state.votes.filter((vote) => vote.plan === "plus").length;
        const proVotes = state.votes.filter((vote) => vote.plan === "pro").length;
        state.family_target_plan = proVotes > plusVotes ? "pro" : "plus";
        break;
      }
      case "start_trial": {
        if (state.trial_used_by.includes(viewer.id)) throw new Error("L’essai a déjà été utilisé.");
        if (state.payments.some((payment) => payment.user_id === viewer.id && payment.request_type === "trial" && payment.status === "pending")) {
          throw new Error("Votre demande d’essai attend déjà l’approbation de l’administrateur.");
        }
        const paymentId = crypto.randomUUID();
        state.payments.push({ id: paymentId, user_id: viewer.id, user_name: viewer.name, scope: "personal", plan: "pro", amount_cents: 0, status: "pending", request_type: "trial", created_at: now.toISOString(), confirmed_at: null });
        planRequestNotification = { paymentId, memberName: viewer.name, scope: "personal", plan: "pro", amountCents: 0, requestType: "trial" };
        break;
      }
      case "confirm_payment": {
        if (viewer.role !== "admin") throw new Error("Action réservée à l’administrateur.");
        const payment = state.payments.find((item) => item.id === text(body.paymentId, 80));
        if (!payment || payment.status !== "pending") throw new Error("Paiement introuvable ou déjà traité.");
        payment.status = "confirmed"; payment.confirmed_at = now.toISOString();
        if (payment.request_type === "trial") {
          if (state.trial_used_by.includes(payment.user_id)) throw new Error("L’essai a déjà été utilisé.");
          state.trial_used_by.push(payment.user_id);
          state.memberships.push({ id: crypto.randomUUID(), scope: "personal", member_id: payment.user_id, plan: "pro", starts_at: now.toISOString(), ends_at: addDaysIso(7, now), source: "trial" });
          unlocked = true;
        } else if (payment.scope === "family") { state.family_fund_cents += payment.amount_cents; unlocked = maybeActivateFamilyPlan(state); }
        else {
          const existing = state.memberships.filter((item) => item.scope === "personal" && item.member_id === payment.user_id && item.plan === payment.plan).at(-1);
          const activeFamily = state.memberships.filter((item) => item.scope === "family" && new Date(item.ends_at) > now).at(-1);
          const candidates = [now, existing ? new Date(existing.ends_at) : now, activeFamily ? new Date(activeFamily.ends_at) : now];
          const start = new Date(Math.max(...candidates.map((date) => date.getTime())));
          state.memberships.push({ id: crypto.randomUUID(), scope: "personal", member_id: payment.user_id, plan: payment.plan, starts_at: start.toISOString(), ends_at: addDaysIso(30, start), source: "personal" });
          unlocked = true;
        }
        break;
      }
      case "reject_payment": {
        if (viewer.role !== "admin") throw new Error("Action réservée à l’administrateur.");
        const payment = state.payments.find((item) => item.id === text(body.paymentId, 80));
        if (!payment || payment.status !== "pending") throw new Error("Paiement introuvable ou déjà traité.");
        payment.status = "rejected";
        break;
      }
      default: throw new Error("Action inconnue.");
    }
    await saveState(state);
    if (planRequestNotification) await notifyAdminOfPlanRequest(planRequestNotification);
    return Response.json(await responseFor(viewer, state, unlocked));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur inattendue." }, { status: 400 });
  }
}
