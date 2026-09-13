# Family Expense Tracker

Family shopping and expense website with private, role-based family accounts,
hosted on Vercel with Supabase for shared data and product images.

## Pages

- `/connexion` — shared login and member sign-up
- `/membre` — create and follow personal shopping carts
- `/livreur` — immediately receive new carts and record real prices
- `/admin` — approve new members, prioritize requests, manage products, and view analytics

New members choose their own four-digit PIN. Their account stays locked until
Youssef approves it from the administration page; sign-up can never create an
admin or delivery account.

Members can scan a packaged product barcode to import its name, pack size, and photo from MyMarket first, with Open Food Facts as a fallback. The buyer still records the real local price. Camera scanning works on `localhost` and deployed HTTPS pages; the code can always be entered manually.

Members can also browse the live MyMarket Morocco catalogue in French, Arabic, or English. Every available department is included except Animals. Selecting a product safely imports its localized name, current price, pack size, and image into the family catalogue and adds it to the member's cart; the buyer can still correct the real market price.

Each completed order adds a fixed 0.50 DH delivery service fee. The fee is included in member totals and admin analytics, while the delivery page shows Josef's monthly service earnings.

The administration page also manages the monthly family budget and records when Josef's wallet has been paid. Members can favorite products and rebuild their latest completed basket. Josef can enable Web Push notifications to receive new orders even when the website is closed.

## Run locally

1. Run the SQL migration in `supabase/migrations/` on the Supabase project.
2. Copy `.dev.vars.example` to `.env.local` and configure the database, login, and notification values.
3. Run `npm run dev`. The home page opens the shared login.

Web Push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the deployment environment.

Real family PINs and Supabase secret keys must remain in private environment
variables and must never be committed.

The website source is in `app/`, the database schema is in `db/`, and database migrations are in `drizzle/`.
