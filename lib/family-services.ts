export const SERVICES_META_KEY = "family_services_state_v1";

export type PlanId = "free" | "plus" | "pro";
export type PaidPlanId = Exclude<PlanId, "free">;
export type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";

export const PLAN_RULES = {
  free: { price_cents: 0, monthly_tasks: 2, recurring: false },
  plus: { price_cents: 1500, monthly_tasks: 15, recurring: true },
  pro: { price_cents: 2900, monthly_tasks: null, recurring: true },
} as const;

export type ServiceTask = {
  id: string;
  title: string;
  description: string;
  template_id: string;
  scope: "family" | "personal";
  creator_id: number;
  creator_name: string;
  assignee_id: number;
  assignee_name: string;
  reward_cents: number;
  priority: "normal" | "urgent";
  deadline: string | null;
  recurrence: "none" | "weekly" | "monthly";
  status: TaskStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type SubscriptionPayment = {
  id: string;
  user_id: number;
  user_name: string;
  scope: "family" | "personal";
  plan: PaidPlanId;
  amount_cents: number;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  confirmed_at: string | null;
};

export type Membership = {
  id: string;
  scope: "family" | "personal";
  member_id: number | null;
  plan: PaidPlanId;
  starts_at: string;
  ends_at: string;
  source: "fund" | "personal" | "trial";
};

export type ServicesState = {
  tasks: ServiceTask[];
  payments: SubscriptionPayment[];
  memberships: Membership[];
  votes: Array<{ user_id: number; plan: PaidPlanId; updated_at: string }>;
  family_target_plan: PaidPlanId;
  family_fund_cents: number;
  trial_used_by: number[];
};

export const emptyServicesState = (): ServicesState => ({
  tasks: [], payments: [], memberships: [], votes: [], family_target_plan: "plus",
  family_fund_cents: 0, trial_used_by: [],
});

export function parseServicesState(value?: string): ServicesState {
  if (!value) return emptyServicesState();
  try {
    const raw = JSON.parse(value) as Partial<ServicesState>;
    const state = emptyServicesState();
    return {
      ...state,
      tasks: Array.isArray(raw.tasks)
        ? raw.tasks.slice(-500).map((task) => ({
            ...task,
            scope: task.scope === "personal" ? "personal" as const : "family" as const,
          }))
        : [],
      payments: Array.isArray(raw.payments) ? raw.payments.slice(-500) : [],
      memberships: Array.isArray(raw.memberships) ? raw.memberships.slice(-100) : [],
      votes: Array.isArray(raw.votes) ? raw.votes.slice(-100) : [],
      family_target_plan: raw.family_target_plan === "pro" ? "pro" : "plus",
      family_fund_cents: Number.isSafeInteger(raw.family_fund_cents) && Number(raw.family_fund_cents) >= 0 ? Number(raw.family_fund_cents) : 0,
      trial_used_by: Array.isArray(raw.trial_used_by) ? raw.trial_used_by.map(Number).filter(Number.isSafeInteger) : [],
    };
  } catch {
    return emptyServicesState();
  }
}

export function effectivePlan(state: ServicesState, userId: number, at = new Date()): PlanId {
  const family = activePlanForScope(state, userId, "family", at);
  const personal = activePlanForScope(state, userId, "personal", at);
  if (family === "pro" || personal === "pro") return "pro";
  if (family === "plus" || personal === "plus") return "plus";
  return "free";
}

export function activePlanForScope(
  state: ServicesState,
  userId: number,
  scope: "family" | "personal",
  at = new Date(),
): PlanId {
  const membership = state.memberships
    .filter((item) =>
      item.scope === scope &&
      (scope === "family" || item.member_id === userId) &&
      new Date(item.starts_at) <= at &&
      new Date(item.ends_at) > at,
    )
    .at(-1);
  return membership?.plan ?? "free";
}

export function planForTaskScope(
  state: ServicesState,
  userId: number,
  scope: "family" | "personal",
  at = new Date(),
): PlanId {
  const personal = activePlanForScope(state, userId, "personal", at);
  if (scope === "personal") return personal;
  const family = activePlanForScope(state, userId, "family", at);
  if (family === "pro" || personal === "pro") return "pro";
  if (family === "plus" || personal === "plus") return "plus";
  return "free";
}

export function monthlyTaskUsageForScope(
  state: ServicesState,
  userId: number,
  scope: "family" | "personal",
  now = new Date(),
) {
  const month = now.toISOString().slice(0, 7);
  const hasActiveFamilyPlan =
    scope === "family" && activePlanForScope(state, userId, "family", now) !== "free";
  return state.tasks.filter((task) =>
    task.scope === scope &&
    task.created_at.startsWith(month) &&
    task.status !== "cancelled" &&
    (hasActiveFamilyPlan || task.creator_id === userId),
  ).length;
}

export function serviceFeeForPlan(plan: PlanId) {
  return plan === "pro" ? 0 : 50;
}

export function addDaysIso(days: number, from = new Date()) {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
