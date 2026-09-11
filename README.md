# Family Expense Tracker

Family shopping and expense website with private, role-based family accounts.

## Pages

- `/connexion` — shared login for every family role
- `/membre` — create and follow personal shopping carts
- `/livreur` — immediately receive new carts and record real prices
- `/admin` — prioritize requests, manage products, and view the monthly total

Members can scan a packaged product barcode to import its name, pack size, and photo from Open Food Facts. The buyer still records the real local price. Camera scanning works on `localhost` and deployed HTTPS pages; the code can always be entered manually.

Members can also browse the live Carrefour Morocco catalogue. The server keeps only products with a usable price of 500 DH or less and excludes electrical products before they reach the website. Selecting one safely imports it into the family catalogue and adds it to the member's cart; the buyer can still correct the real market price.

## Run locally

```bash
npm run dev
```

Open `http://localhost:5173`. The home page opens the shared login.

Copy `.dev.vars.example` to `.dev.vars`, choose a private starter password, and never commit that local file. Real family PINs belong only in the private database—not in this public repository.

The website source is in `app/`, the database schema is in `db/`, and database migrations are in `drizzle/`.
