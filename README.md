# Family Expense Tracker

Family shopping and expense website with private, role-based family accounts,
hosted on Vercel with Supabase for shared data and product images.

## Pages

- `/create-family` — create an isolated family workspace and its Family Owner
- `/connexion` — family-code login and invitation-only member sign-up
- `/membre` — create and follow personal shopping carts
- `/livreur` — the family Buyer receives carts and records real prices
- `/admin` — the Family Owner configures the Buyer, approves members, manages requests, and views analytics

Each household has a private family code and a hidden database tenant ID. Usernames
only need to be unique inside that family. New members choose a 6–12 digit PIN,
stored only as an Argon2id hash, and remain locked until their Family Owner approves
them. Exactly one active Buyer account is allowed per family.

Members can scan a packaged product barcode to import its name, pack size, and photo from MyMarket first, with Open Food Facts as a fallback. The buyer still records the real local price. Camera scanning works on `localhost` and deployed HTTPS pages; the code can always be entered manually.

Members can also browse the live MyMarket Morocco catalogue in French, Arabic, or English. Every available department is included except Animals. Selecting a product safely imports its localized name, current price, pack size, and image into the family catalogue and adds it to the member's cart; the buyer can still correct the real market price.

Each completed order adds its plan-specific delivery service fee. Cart completion,
product counters, service-fee recording, and wallet charging run in one database
transaction so retries cannot charge the same order twice.

The administration page also manages the monthly family budget and Buyer payments.
Members can favorite products and rebuild their latest completed basket. The Buyer
can enable Web Push notifications for new orders. Members can opt in to device
reminders from Settings; GitHub Actions sends the reminder every three hours in the
Africa/Casablanca timezone.

## Run locally

1. Apply every SQL migration in `supabase/migrations/` in filename order.
2. Copy `.dev.vars.example` to `.env.local` and configure the database, login, and notification values.
3. Run `npm run dev`. The home page opens the shared login.

For explicit Web Push credentials, configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the deployment environment. If they are omitted, the server derives a stable VAPID key pair from the existing Supabase server secret. Scheduled reminder calls are authenticated with GitHub Actions OIDC and require no long-lived GitHub or Vercel reminder secret.

Real family PINs and Supabase secret keys must remain in private environment
variables and must never be committed.

The website source is in `app/`, shared server logic is in `lib/`, and production
database migrations are in `supabase/migrations/`. The multi-tenant technical
specification and rollback roadmap are in `docs/darnaflow-multitenant-architecture.md`.
