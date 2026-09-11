# Family Expense Tracker

Family shopping and expense website with private, role-based family accounts.

## Pages

- `/connexion` — shared login for every family role
- `/membre` — create and follow personal shopping carts
- `/livreur` — immediately receive new carts and record real prices
- `/admin` — prioritize requests, manage products, and view the monthly total

## Run locally

```bash
npm run dev
```

Open `http://localhost:5173`. The home page opens the shared login.

Copy `.dev.vars.example` to `.dev.vars`, choose a private starter password, and never commit that local file. Real family PINs belong only in the private database—not in this public repository.

The website source is in `app/`, the database schema is in `db/`, and database migrations are in `drizzle/`.
