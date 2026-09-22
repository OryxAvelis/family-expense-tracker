# DarnaFlow multi-tenant technical specification

Status: implementation-ready architecture specification
Version: 1.0
Date: 2026-09-22
Primary production domain: darnaflow.com
Future Morocco domain: darnaflow.ma

## 1. Purpose

DarnaFlow is evolving from one private household application into a multi-tenant SaaS platform. Each household becomes an isolated Family Account containing one Family Owner, exactly one active Buyer, and multiple Members.

This specification defines the target database, APIs, frontend architecture, security controls, migration, and performance plan. It deliberately prioritizes household isolation over delivery speed.

The acceptance question for every table, query, endpoint, event, cache key, file, and log is:

> Can one family accidentally or intentionally access another family's data?

If the answer is yes or uncertain, the design is rejected.

## 2. Scope and product decisions

### 2.1 Confirmed product model

- darnaflow.com is the canonical application domain.
- darnaflow.ma may redirect to darnaflow.com when Morocco-specific expansion begins.
- A domain improves trust and accessibility. It does not provide application capacity.
- Every household owns a private Family Account.
- The family display name is not globally unique.
- Every family receives a unique, revocable invitation code.
- Existing members sign in with family code, username, and PIN.
- New members join through a private invitation link or family code.
- Usernames are unique only inside a family.
- Internal family_id values never appear in URLs, HTML, client state, API payloads, analytics, error messages, or realtime payloads.
- A Family Account has exactly one active Family Owner and at most one active Buyer.
- Family Owners manage accounts but cannot impersonate users or view their PINs.
- Platform Owners troubleshoot through anonymous support references and sanitized health events only.
- Family and Member subscriptions coexist. Family entitlements apply to the household; Member entitlements apply only to that member.
- The current household becomes the first family without losing members, wallets, carts, services, receipts, subscriptions, or history.

### 2.2 Explicit non-goals for the first migration

- No public marketplace connecting unrelated families.
- No multiple active Buyers inside one family.
- No Platform Owner impersonation.
- No cross-family reporting containing names, amounts, products, notes, receipts, or addresses.
- No destructive cleanup of legacy tables during the initial cutover.
- No redesign of plan pricing in the tenancy migration. Current Free, Plus, and Pro rules are preserved as configurable plan data.

## 3. Non-negotiable architecture invariants

1. Tenant context comes from the authenticated server session, never from a request body, URL parameter, form field, header supplied by the browser, or client-side state.
2. Every tenant-owned table has family_id UUID NOT NULL.
3. Every relationship between tenant-owned tables uses a composite foreign key containing family_id.
4. Row-level security is enabled and forced on every tenant-owned table.
5. Runtime requests never use the Supabase service-role key for tenant queries.
6. The browser never receives the internal family primary key.
7. Cross-family lookup failures return NOT_FOUND instead of revealing that another family's record exists.
8. Money and order state changes execute in one database transaction.
9. Wallet entries are immutable. Corrections are compensating entries, not edits or deletes.
10. Every retryable write has an idempotency key enforced by a database unique constraint.
11. Logs never contain names, usernames, PINs, invitation secrets, order contents, wallet amounts, receipts, or raw request bodies.
12. Files are served through authorized application endpoints. Raw storage paths are never exposed.
13. The Family Owner can reset access only through a one-time reset flow and can never choose, retrieve, or display a member's final PIN.
14. There is no application-level break-glass impersonation mode.
15. Public onboarding remains disabled until the isolation test suite and migration verification both pass.

## 4. Current-state assessment

The existing application is safe for one known household but is not a multi-tenant foundation.

| Current behavior | Multi-tenant risk | Required change |
| --- | --- | --- |
| family_users has globally unique username | Two families cannot both have a member named Mohamed | Unique constraint becomes family_id plus normalized_username |
| No families table or family_id | All records belong to one implicit household | Add explicit families and mandatory tenant keys |
| Server uses Supabase service_role | RLS is bypassed on the main request path | Use a request-scoped authenticated database token subject to RLS |
| Wallets live as JSON arrays in app_meta | Concurrent updates can overwrite each other | Immutable wallet ledger plus atomic SQL functions |
| Services, payments, memberships, and votes share one JSON document | Writes race and the document grows globally | Normalize into tenant tables |
| /api/family returns the complete household state | Payload and query count grow with every order | Resource endpoints, pagination, and incremental events |
| Visible pages poll every eight seconds | 200 users create about 25 full reloads per second | Realtime invalidation plus focused cache refetch |
| Current PIN supports exactly four digits | Internet-facing credential has low entropy | Six-digit minimum, Argon2id, lockout, and upgrade flow |
| Sessions may last one year | Stolen sessions remain useful too long | Short access lifetime, rolling inactivity limit, rotation, and revocation |
| app_meta mixes configuration, finance, and business data | Tenant scoping is easy to omit | Typed, normalized tables with family_id |

## 5. Target system overview

### 5.1 Logical planes

DarnaFlow has two deliberately separated planes.

**Family data plane**

- Family settings and membership
- Products and favorites
- Orders, items, receipts, and status history
- Family and personal wallets
- Services
- Subscription contributions and entitlements
- Family audit events and notifications

All data-plane records carry family_id and are protected by forced RLS.

**Platform control plane**

- Global plan definitions
- Global service and product reference catalogs
- Anonymous family support references
- Deployment health, job state, latency, and error codes
- Platform operator identities and audit records

The control plane contains no family name, member name, username, PIN, order content, expense, wallet amount, receipt, or free-form family text.

### 5.2 Request flow

~~~text
Browser
  -> darnaflow.com / Next.js on Vercel
  -> encrypted HttpOnly opaque session cookie
  -> server resolves session to auth_subject and role
  -> server creates a short-lived database JWT containing sub and role only
  -> Supabase PostgREST / RPC with authenticated role
  -> RLS derives member and family inside PostgreSQL from auth.uid()
  -> family-scoped result is mapped to a DTO with no family_id
~~~

The internal family_id is not included in the browser cookie or the short-lived database JWT. PostgreSQL derives it by joining auth.uid() to the active family member record.

### 5.3 Identifier policy

| Identifier | Purpose | Browser visibility |
| --- | --- | --- |
| families.id | Internal tenant primary key | Never |
| families.support_ref | Anonymous support identifier such as DF-7K2M9Q | Yes, on support screen only |
| family_members.id | Internal relational identifier | Never |
| family_members.public_id | Opaque member reference used in family APIs | Yes |
| orders.public_id | Opaque order reference | Yes |
| invitation plaintext code | Private household join secret | Only when the owner creates or rotates it |
| invitation code_hmac | Indexed verifier | Never |
| session token | Authentication secret | HttpOnly cookie only |

Public IDs are random UUIDs and do not encode family, role, creation order, or database sequence.

## 6. Roles and authorization matrix

### 6.1 Platform Owner

Can:

- View anonymous support_ref, current plan identifier, tenant status, member count, deployment version, last successful job time, aggregate latency, and sanitized error codes.
- Re-run an idempotent background job.
- Revoke a broken invitation at the Family Owner's request using support_ref.
- Disable or re-enable a Family Account for abuse or billing status without opening its content.

Cannot:

- Read family names, member names, usernames, PIN hashes, invitation plaintext, wallets, amounts, orders, products selected, services, notes, receipts, push endpoints, or personal analytics.
- Join a Family Account.
- impersonate a Family Owner, Buyer, or Member.
- query tenant tables through the platform UI.

### 6.2 Family Owner

Can:

- Update the family display name and household settings.
- Create, invite, activate, suspend, and archive Members.
- Create or replace the single Buyer.
- Rotate the family join code and revoke invitations.
- Manage the family wallet, budget, household subscriptions, and family service configuration.
- View family orders and household history according to product rules.
- Initiate a PIN reset that produces a one-time member-controlled reset.

Cannot:

- Read a PIN or PIN hash.
- Set a member's final PIN.
- impersonate another account.
- access another family.
- create a second active Owner or Buyer.

### 6.3 Buyer

Can:

- View the minimum member identity and order details required to purchase for the same family.
- Accept, shop, update prices, mark items unavailable, attach receipts, complete delivery, and view Buyer earnings.
- Manage their own account.

Cannot:

- Manage members, family settings, subscriptions, or unrelated wallet entries.
- create another Buyer.
- access personal services not assigned to the Buyer.

### 6.4 Member

Can:

- Create and manage their own orders until the allowed status boundary.
- Create family or personal services subject to entitlements.
- View their own personal wallet and permitted family wallet summary.
- Manage their own profile and change their PIN.

Cannot:

- Manage other accounts.
- update Buyer-only order state.
- view another member's private wallet or personal service.

### 6.5 Role cardinality

Use partial unique indexes:

~~~sql
create unique index one_active_owner_per_family
  on family_members (family_id)
  where role = 'owner' and status = 'active';

create unique index one_active_buyer_per_family
  on family_members (family_id)
  where role = 'buyer' and status = 'active';
~~~

Buyer replacement occurs in one transaction: archive the existing Buyer, create or activate the replacement, then write an audit event. Historical orders keep the previous Buyer reference.

## 7. Database schema

### 7.1 Schema boundaries

- public: RLS-protected family data and safe reference views
- app_private: credentials, sessions, idempotency, outbox internals, security functions, and migration maps
- platform: non-tenant catalogs, plan definitions, anonymous support health, and platform audit data

Browser-facing code receives no grants on app_private or platform base tables.

### 7.2 Core enumerations

~~~sql
create type family_status as enum ('provisioning', 'active', 'suspended', 'archived');
create type family_member_role as enum ('owner', 'buyer', 'member');
create type family_member_status as enum ('invited', 'pending', 'active', 'suspended', 'archived');
create type wallet_kind as enum ('family', 'personal', 'subscription_fund');
create type wallet_entry_type as enum (
  'deposit', 'contribution', 'order_debit', 'service_credit',
  'return', 'transfer_in', 'transfer_out', 'settlement', 'adjustment'
);
create type order_status as enum ('draft', 'pending', 'ready', 'shopping', 'completed', 'cancelled');
create type order_item_status as enum ('requested', 'bought', 'unavailable');
create type service_scope as enum ('family', 'personal');
create type service_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
create type subscription_scope as enum ('family', 'member');
create type payment_status as enum ('pending', 'confirmed', 'rejected', 'expired', 'refunded');
~~~

### 7.3 Family and identity tables

#### families

~~~sql
create table public.families (
  id uuid primary key default gen_random_uuid(),
  support_ref text not null unique,
  display_name text not null check (char_length(display_name) between 2 and 80),
  default_locale text not null default 'fr' check (default_locale in ('fr', 'ar', 'en')),
  currency_code char(3) not null default 'MAD',
  time_zone text not null default 'Africa/Casablanca',
  status family_status not null default 'provisioning',
  require_member_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id)
);
~~~

support_ref is generated from cryptographically random bytes and is not derived from the family name or ID.

#### family_members

~~~sql
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  auth_subject uuid not null unique,
  display_name text not null check (char_length(display_name) between 2 and 80),
  normalized_username text not null,
  initials text not null check (char_length(initials) between 1 and 4),
  role family_member_role not null,
  status family_member_status not null default 'pending',
  created_by_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (family_id, id),
  unique (family_id, normalized_username),
  foreign key (family_id, created_by_member_id)
    references public.family_members(family_id, id)
);
~~~

#### member_credentials

~~~sql
create table app_private.member_credentials (
  family_id uuid not null,
  member_id uuid primary key,
  pin_hash text not null,
  hash_algorithm text not null default 'argon2id-v1',
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  reset_required boolean not null default false,
  last_changed_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);
~~~

No API returns this table. Only narrowly scoped authentication functions can select or update it.

#### family_sessions

~~~sql
create table app_private.family_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  family_id uuid not null,
  member_id uuid not null,
  auth_subject uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  rotated_from uuid,
  revoked_at timestamptz,
  client_fingerprint_hash bytea,
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);
~~~

#### family_invitations

~~~sql
create table public.family_invitations (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  code_hmac bytea not null unique,
  link_token_hash bytea unique,
  allowed_role family_member_role not null default 'member'
    check (allowed_role in ('buyer', 'member')),
  max_uses integer not null default 25 check (max_uses between 1 and 100),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by_member_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (family_id, created_by_member_id)
    references public.family_members(family_id, id)
);
~~~

Plaintext invitation codes are shown once and stored only as an HMAC using a server-held pepper. Codes use at least 60 bits of entropy and can be rotated.

#### pin_reset_tokens

~~~sql
create table app_private.pin_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by_member_id uuid not null,
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade,
  foreign key (family_id, created_by_member_id)
    references public.family_members(family_id, id)
);
~~~

### 7.4 Products and favorites

#### platform.catalog_products

Global, non-family reference data imported from approved providers. It contains product labels, barcodes, pack sizes, source IDs, and vetted image references. It contains no family activity, price history, or favorites.

#### family_products

~~~sql
create table public.family_products (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  catalog_product_id uuid references platform.catalog_products(id),
  name_fr text not null,
  name_ar text not null default '',
  name_en text not null default '',
  category text not null,
  unit text not null,
  package_size text,
  current_price_cents bigint not null check (current_price_cents >= 0),
  image_ref uuid,
  barcode text,
  purchase_count integer not null default 0 check (purchase_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  unique nulls not distinct (family_id, catalog_product_id),
  unique nulls not distinct (family_id, barcode)
);
~~~

#### member_favorites

~~~sql
create table public.member_favorites (
  family_id uuid not null,
  member_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (family_id, member_id, product_id),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade,
  foreign key (family_id, product_id)
    references public.family_products(family_id, id) on delete cascade
);
~~~

### 7.5 Orders

#### orders

~~~sql
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  order_number bigint generated always as identity,
  ordered_by_member_id uuid not null,
  assigned_buyer_member_id uuid,
  created_by_member_id uuid not null,
  status order_status not null default 'pending',
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  wallet_id uuid,
  missing_products_note text not null default '',
  product_total_cents bigint not null default 0 check (product_total_cents >= 0),
  service_fee_cents bigint not null default 0 check (service_fee_cents >= 0),
  wallet_debit_cents bigint not null default 0 check (wallet_debit_cents >= 0),
  cash_paid_cents bigint not null default 0 check (cash_paid_cents >= 0),
  idempotency_key uuid not null,
  version integer not null default 1,
  submitted_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  unique (family_id, order_number),
  unique (family_id, idempotency_key),
  foreign key (family_id, ordered_by_member_id)
    references public.family_members(family_id, id),
  foreign key (family_id, assigned_buyer_member_id)
    references public.family_members(family_id, id),
  foreign key (family_id, created_by_member_id)
    references public.family_members(family_id, id)
);
~~~

order_number is shown only inside its family. public_id is used by APIs.

#### order_items

~~~sql
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  request_mode text not null check (request_mode in ('quantity', 'amount')),
  quantity_hundredths integer check (quantity_hundredths > 0),
  requested_amount_cents bigint check (requested_amount_cents > 0),
  requested_unit_price_cents bigint not null check (requested_unit_price_cents >= 0),
  actual_unit_price_cents bigint not null default 0 check (actual_unit_price_cents >= 0),
  actual_line_total_cents bigint not null default 0 check (actual_line_total_cents >= 0),
  status order_item_status not null default 'requested',
  product_name_snapshot text not null,
  unit_snapshot text not null,
  package_size_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, order_id)
    references public.orders(family_id, id) on delete cascade,
  foreign key (family_id, product_id)
    references public.family_products(family_id, id),
  check (
    (request_mode = 'quantity' and quantity_hundredths is not null and requested_amount_cents is null)
    or
    (request_mode = 'amount' and quantity_hundredths is null and requested_amount_cents is not null)
  )
);
~~~

#### order_status_events

Append-only events preserve who changed an order and when.

~~~sql
create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  order_id uuid not null,
  actor_member_id uuid not null,
  from_status order_status,
  to_status order_status not null,
  reason_code text,
  created_at timestamptz not null default now(),
  foreign key (family_id, order_id)
    references public.orders(family_id, id) on delete cascade,
  foreign key (family_id, actor_member_id)
    references public.family_members(family_id, id)
);
~~~

#### order_receipts

Stores metadata only. The object path is internal and uses family_id as a storage partition. Clients receive a short-lived application URL based on public_id.

### 7.6 Wallets and immutable ledger

#### wallets

~~~sql
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  kind wallet_kind not null,
  owner_member_id uuid,
  currency_code char(3) not null default 'MAD',
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, owner_member_id)
    references public.family_members(family_id, id),
  check (
    (kind = 'personal' and owner_member_id is not null)
    or
    (kind in ('family', 'subscription_fund') and owner_member_id is null)
  )
);

create unique index one_family_wallet
  on public.wallets (family_id)
  where kind = 'family';

create unique index one_subscription_fund
  on public.wallets (family_id)
  where kind = 'subscription_fund';

create unique index one_personal_wallet_per_member
  on public.wallets (family_id, owner_member_id)
  where kind = 'personal';
~~~

#### wallet_entries

~~~sql
create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  family_id uuid not null,
  wallet_id uuid not null,
  entry_type wallet_entry_type not null,
  amount_cents bigint not null check (amount_cents <> 0),
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  actor_member_id uuid not null,
  counterparty_member_id uuid,
  order_id uuid,
  service_request_id uuid,
  reversal_of_entry_id uuid,
  idempotency_key uuid not null,
  description_code text not null,
  created_at timestamptz not null default now(),
  unique (family_id, id),
  unique (family_id, idempotency_key),
  foreign key (family_id, wallet_id)
    references public.wallets(family_id, id),
  foreign key (family_id, actor_member_id)
    references public.family_members(family_id, id),
  foreign key (family_id, counterparty_member_id)
    references public.family_members(family_id, id),
  foreign key (family_id, order_id)
    references public.orders(family_id, id),
  foreign key (family_id, reversal_of_entry_id)
    references public.wallet_entries(family_id, id)
);
~~~

Only database functions may insert wallet_entries or update wallets.balance_cents. Direct UPDATE and DELETE grants are revoked.

Atomic wallet function algorithm:

1. Resolve the current family and actor inside PostgreSQL.
2. SELECT the wallet FOR UPDATE.
3. Validate role, wallet ownership, currency, amount, and idempotency key.
4. Validate that the referenced order or service belongs to the same family through a composite key.
5. Compute the debit without permitting a negative balance.
6. Insert the ledger entry.
7. Update balance and version.
8. Insert a family event and audit event.
9. Commit all operations together.

### 7.7 Services

#### service_requests

Fields:

- id, public_id, family_id
- scope: family or personal
- template_id and immutable title/description snapshot
- created_by_member_id and beneficiary_member_id
- assigned_member_id
- reward_cents
- priority, deadline, recurrence_rule
- status and status timestamps
- idempotency_key
- created_at and updated_at

Every member reference uses a composite family_id foreign key. Personal services are visible only to the creator, beneficiary, assignee, and Family Owner when household policy permits it. The Platform Owner never sees them.

#### service_status_events

Append-only status history equivalent to order_status_events.

### 7.8 Subscriptions

#### platform.plans

Global plan definitions:

- id: free, plus, pro
- display metadata
- monthly price
- family and personal eligibility
- service limit
- recurring-service entitlement
- delivery-fee rule
- feature flags
- effective_from and effective_until

Changing a plan creates a new version; active subscriptions retain a plan snapshot.

#### family_subscriptions

- family_id
- plan_version_id
- status
- starts_at and ends_at
- source: fund, provider, trial, manual migration
- provider_subscription_ref, encrypted or tokenized
- no family name or member name in provider metadata

#### member_subscriptions

- family_id and member_id
- plan_version_id
- status
- starts_at and ends_at
- source and provider reference

#### subscription_payment_requests

- family_id, requesting member, scope, plan version
- amount_cents and currency
- request_type: payment or trial
- status
- provider payment reference or private proof file reference
- idempotency key and timestamps

#### subscription_contributions

Immutable contributions into the subscription_fund wallet. When the confirmed fund reaches the selected plan price, one atomic function debits the fund and activates the family subscription.

Effective entitlement is computed as the higher feature level of the active family subscription and the current member's active personal subscription. Personal time is paused or extended according to the existing DarnaFlow rule while a covering family plan is active.

### 7.9 Notifications, files, audit, and events

#### push_subscriptions

Contains family_id, member_id, endpoint hash, encrypted endpoint material, key material, device label, created_at, last_success_at, and revoked_at. Platform support sees only active device count and delivery health.

#### notification_outbox

Transactional outbox for order, service, subscription, and reminder messages. Business transactions insert an outbox event in the same commit. A worker sends it with retry and dead-letter handling.

#### family_events

An ordered, short-retention invalidation stream:

- family_id
- sequence number
- event_type
- entity_public_id
- created_at

Payloads contain no names, amounts, notes, products, or family_id. Clients refetch the authorized resource when an event arrives.

#### family_audit_events

Visible only to the Family Owner. Contains actor public reference, action code, entity type and public reference, timestamp, request_id, and a structured metadata allowlist. It never contains credentials or raw before/after payloads.

#### platform.family_health

A sanitized table or materialized view containing:

- support_ref
- tenant status
- plan identifier
- active member count
- active realtime connection count
- schema version
- last successful background job
- deployment version
- aggregate error code counts
- aggregate latency buckets

It contains no family_id in the API projection and no identifiable or financial content.

### 7.10 Required indexes

At minimum:

~~~sql
create index members_family_status on family_members(family_id, status);
create index orders_family_status_submitted on orders(family_id, status, submitted_at desc);
create index orders_family_member_submitted on orders(family_id, ordered_by_member_id, submitted_at desc);
create index items_family_order on order_items(family_id, order_id);
create index products_family_active_name on family_products(family_id, active, name_fr);
create index wallet_entries_family_wallet_created on wallet_entries(family_id, wallet_id, created_at desc);
create index services_family_status_created on service_requests(family_id, status, created_at desc);
create index subscriptions_family_status_end on family_subscriptions(family_id, status, ends_at desc);
create index member_subscriptions_lookup on member_subscriptions(family_id, member_id, status, ends_at desc);
create index events_family_sequence on family_events(family_id, sequence);
~~~

Queries used by production endpoints require EXPLAIN ANALYZE review before release. Pagination uses stable cursor pairs such as submitted_at plus public_id, never OFFSET for unbounded history.

## 8. RLS and database security

### 8.1 Tenant derivation

The database token has auth.uid() equal to the current member's auth_subject. It does not include family_id.

~~~sql
create or replace function app_private.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.family_members
  where auth_subject = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function app_private.current_family_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select family_id
  from public.family_members
  where auth_subject = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function app_private.current_family_role()
returns family_member_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.family_members
  where auth_subject = auth.uid()
    and status = 'active'
  limit 1
$$;
~~~

EXECUTE is granted to authenticated only. Function ownership is a dedicated non-login role. search_path is fixed to prevent object substitution.

### 8.2 Base policy

Every tenant table receives an isolation policy equivalent to:

~~~sql
alter table public.orders enable row level security;
alter table public.orders force row level security;

create policy orders_same_family
on public.orders
for select
to authenticated
using (family_id = app_private.current_family_id());
~~~

Writes add role and ownership checks:

~~~sql
create policy orders_member_create
on public.orders
for insert
to authenticated
with check (
  family_id = app_private.current_family_id()
  and ordered_by_member_id = app_private.current_member_id()
  and created_by_member_id = app_private.current_member_id()
);
~~~

Complex money and status mutations are not exposed as direct table updates. They use audited RPC functions that repeat the family and role checks internally.

### 8.3 Defense in depth

- API repositories also add family_id = resolvedSession.familyId to every query.
- A test-only assertion fails when a tenant repository is called without TenantContext.
- family_id is immutable after insertion.
- Composite foreign keys prevent linking an in-family row to another family's member, wallet, order, or product.
- Database roles used by the application do not have BYPASSRLS.
- The service-role key is limited to migrations and isolated workers. It is not imported by route handlers.
- Platform APIs use a separate database role that can read only sanitized control-plane views.
- Error responses never reveal whether a foreign public_id exists.

### 8.4 Storage isolation

- Objects use internal prefixes: family_id/entity_type/random_object_id.
- Storage RLS derives the current family and compares it to internal object metadata.
- Clients upload through signed, single-purpose endpoints with MIME and size limits.
- Clients download through /api/v1/files/:publicFileId after authorization.
- Signed storage URLs have short expirations and are never logged.
- Profile images, receipts, payment proofs, and service proofs use different buckets and policies.

### 8.5 Cross-tenant test matrix

For every resource and role:

1. Create Family A and Family B fixtures.
2. Authenticate as each role in Family A.
3. Attempt GET, list filtering, search, create with foreign reference, update, delete, file access, realtime subscription, and RPC calls against Family B public IDs.
4. Expect 404 or an empty result, never 403 containing existence information.
5. Verify no audit, notification, cache, or search side channel leaks Family B.
6. Repeat with stale sessions, suspended users, archived buyers, rotated invitations, and replayed idempotency keys.

The release fails on a single cross-family read or write.

## 9. Authentication and PIN security

### 9.1 Login flow

1. Browser posts familyCode, username, and PIN to /api/v1/auth/login.
2. Server validates syntax before database work.
3. familyCode is normalized and converted to an HMAC for indexed lookup.
4. Username is normalized with Unicode NFKC and looked up only inside that family.
5. Credential verification occurs server-side in constant time.
6. On success, create an opaque random session token and store only its hash.
7. Set __Host-df_session with Secure, HttpOnly, Path=/, and SameSite=Lax.
8. Return role, member public profile, family display name, locale, and entitlements. Do not return family_id.

### 9.2 PIN requirements

- New PINs contain 6 to 12 digits.
- Hash with Argon2id using a unique 16-byte salt.
- Initial target parameters: 64 MiB memory, 3 iterations, parallelism 1, 32-byte output.
- Benchmark production runtime and tune to approximately 150–300 ms verification.
- Store algorithm and parameter version with the hash.
- Never log PIN input, hash, salt, or reset token.
- Compare in constant time.
- Deny common PINs, sequential values, repeated digits, and PINs containing birth-year-like patterns when known.

Existing four-digit PBKDF2 hashes are migrated as legacy credentials without learning the PIN. On the first successful login, the user is required to choose a new six-digit or longer PIN; the new Argon2id hash replaces the legacy hash.

### 9.3 Lockout and abuse protection

- Five failed attempts for the same family-code and username tuple in 15 minutes triggers a temporary lock.
- Ten failed attempts trigger a longer account lock and Family Owner notification.
- IP and device limits prevent distributing attempts across usernames.
- Responses use one generic INVALID_CREDENTIALS message for bad family code, username, PIN, inactive member, and archived family.
- Invitation and reset tokens have at least 128 bits of entropy and expire.
- Session idle lifetime: 12 hours.
- Session absolute lifetime: 30 days.
- Rotate the session token after login, PIN change, role change, and every 24 hours of continued use.
- Revocation is immediate after suspension, Buyer replacement, owner transfer, or PIN reset.

### 9.4 Family Owner reset flow

The owner selects Reset access. DarnaFlow creates a short-lived one-time reset token. The owner may send the link or display a QR code, but the final PIN is entered by the member on their device. The owner sees only reset status, never the PIN.

## 10. API specification

### 10.1 API conventions

- Base path: /api/v1
- JSON request and response bodies
- Session cookie authentication
- Origin and CSRF validation on state-changing browser requests
- Tenant context is session-derived
- family_id is rejected if submitted by a client
- Resource IDs are public_id values
- Cursor pagination with limit from 1 to 100
- UTC timestamps in ISO 8601
- Monetary values are integer cents plus a currency code
- All writes accept request_id for tracing
- Order, wallet, service, and subscription writes require Idempotency-Key
- Optimistic concurrency uses If-Match with a version or ETag where applicable

### 10.2 Standard error

~~~json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some information is invalid.",
    "fields": {
      "username": "Use 2 to 40 supported characters."
    },
    "requestId": "req_7H..."
  }
}
~~~

Production messages do not include SQL text, table names, internal IDs, stack traces, provider secrets, or foreign-tenant existence.

Core codes:

- INVALID_CREDENTIALS
- ACCOUNT_PENDING
- SESSION_EXPIRED
- ROLE_FORBIDDEN
- NOT_FOUND
- VALIDATION_FAILED
- CONFLICT
- VERSION_CONFLICT
- IDEMPOTENCY_CONFLICT
- RATE_LIMITED
- WALLET_FUNDS_INSUFFICIENT
- BUYER_ALREADY_EXISTS
- PLAN_REQUIRED
- SERVICE_UNAVAILABLE

### 10.3 Authentication and onboarding endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| POST | /onboarding/families | Public | Atomically create family, owner, wallets, join code, and session |
| POST | /auth/login | Public | Family code plus username plus PIN |
| POST | /auth/join | Public | Join by family code or invitation token |
| POST | /auth/logout | Authenticated | Revoke current session |
| POST | /auth/refresh | Authenticated | Rotate session |
| GET | /me | Authenticated | Current safe profile, role, family display name, entitlements |
| POST | /me/pin/change | Authenticated | Change own PIN |
| POST | /auth/pin-reset/:token | Public token | Set PIN through one-time reset |

Family creation request:

~~~json
{
  "familyName": "Benali Family",
  "ownerName": "Nadia",
  "username": "nadia",
  "pin": "628194",
  "locale": "fr"
}
~~~

The transaction creates exactly one owner, one family wallet, one subscription-fund wallet, one personal wallet, a join code, and a session. A failure rolls back all rows.

Join request:

~~~json
{
  "familyCode": "7K2M-Q8NP",
  "invitationToken": null,
  "name": "Mohamed",
  "username": "mohamed",
  "pin": "482951"
}
~~~

The endpoint never discloses a family name until the code or token is valid.

### 10.4 Family and member endpoints

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | /family | Owner, Buyer, Member | Safe family display settings |
| PATCH | /family | Owner | Update name, locale, time zone, approval policy |
| GET | /family/invitations | Owner | List invitation status without secrets |
| POST | /family/invitations | Owner | Create link or restricted Buyer invitation |
| POST | /family/join-code/rotate | Owner | Revoke old code and return new code once |
| GET | /members | Owner; limited Buyer view | Cursor-paginated household accounts |
| POST | /members | Owner | Create invitation, not a final credential |
| PATCH | /members/:memberPublicId | Owner | Activate, suspend, archive, or edit allowed profile fields |
| POST | /members/:memberPublicId/pin-reset | Owner | Create one-time reset |
| POST | /members/:memberPublicId/assign-buyer | Owner | Atomic Buyer replacement |
| GET | /me/profile | Authenticated | Own profile |
| PATCH | /me/profile | Authenticated | Update own allowed fields |

No endpoint supports impersonation.

### 10.5 Wallet endpoints

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | /wallets | Authenticated | Wallet summaries authorized for caller |
| GET | /wallets/:walletPublicId/entries | Authorized caller | Cursor-paginated ledger |
| POST | /wallets/family/contributions | Owner or permitted Member | Record a contribution atomically |
| POST | /wallets/:walletPublicId/returns | Owner | Record cash returned with compensating entry |
| POST | /wallets/transfers | Owner | Atomic family/personal transfer |
| POST | /wallets/buyer-settlements | Owner | Record Buyer settlement |

Wallet responses expose only balances the caller may see. Every money POST requires Idempotency-Key and returns the same response for an exact retry.

### 10.6 Order endpoints

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | /orders | Authenticated | Role-filtered cursor list |
| POST | /orders | Member or Owner | Create order atomically |
| GET | /orders/:orderPublicId | Authorized caller | Order detail |
| PATCH | /orders/:orderPublicId | Creator before lock | Edit permitted draft/pending fields |
| POST | /orders/:orderPublicId/accept | Buyer | Accept order |
| POST | /orders/:orderPublicId/items/:itemPublicId | Buyer | Record price or unavailable state |
| POST | /orders/:orderPublicId/complete | Buyer | Complete order and settle ledger atomically |
| POST | /orders/:orderPublicId/cancel | Creator or Owner by policy | Valid state-machine cancellation |
| POST | /orders/:orderPublicId/receipt | Buyer | Authorized upload |
| GET | /orders/:orderPublicId/receipt | Authorized caller | Authorized short-lived download |

The create-order RPC:

- Validates all product references belong to the current family.
- Calculates product total and service fee server-side.
- Stores immutable product and price snapshots.
- Inserts order and items.
- Inserts initial status event.
- Inserts realtime invalidation and notification outbox events.
- Enforces idempotency.

The complete-order RPC locks the order and selected wallet, recalculates actual totals, inserts wallet entries, updates balances, increments purchase counts, writes events, and commits once.

### 10.7 Service endpoints

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | /services/catalog | Authenticated | Entitlement-filtered service catalog |
| GET | /services/requests | Authenticated | Role- and scope-filtered list |
| POST | /services/requests | Member or Owner | Create family or personal service |
| POST | /services/requests/:id/start | Assigned member or Buyer | Start work |
| POST | /services/requests/:id/complete | Assigned member or Buyer | Complete and post reward atomically |
| POST | /services/requests/:id/cancel | Creator or Owner by policy | Cancel valid state |

Personal service visibility is explicitly tested. List endpoints do not rely on frontend filtering.

### 10.8 Subscription endpoints

| Method | Endpoint | Roles | Purpose |
| --- | --- | --- | --- |
| GET | /plans | Public | Current public plan versions |
| GET | /subscriptions | Authenticated | Effective family and own member entitlement |
| POST | /subscriptions/family/contributions | Member | Contribute to household plan fund |
| POST | /subscriptions/member/checkout | Member | Request personal plan |
| POST | /subscriptions/trials | Member | Request permitted trial |
| POST | /billing/webhooks/:provider | Provider signed | Confirm payment idempotently |
| GET | /family/subscription-fund | Owner and permitted Members | Household funding progress |

Payment providers receive support_ref and payment public_id only. They do not receive family or member names unless legally required by the payment flow and separately consented.

### 10.9 Platform support endpoints

Hosted under a separate operator surface such as ops.darnaflow.com with phishing-resistant MFA.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/platform/families/:supportRef/health | Sanitized health only |
| GET | /api/platform/events?supportRef=... | Sanitized error codes and job events |
| POST | /api/platform/jobs/:jobPublicId/retry | Retry an idempotent failed job |
| POST | /api/platform/families/:supportRef/suspend | Suspend tenant without reading content |
| POST | /api/platform/families/:supportRef/reactivate | Reactivate tenant |

There is no endpoint to list names, open a household dashboard, retrieve expenses, or generate a family session.

### 10.10 Rate limits

Distributed token-bucket limits use IP, session, endpoint class, and an HMAC of relevant identifiers. Raw usernames and family codes are not stored in the limiter.

| Operation | Initial limit |
| --- | --- |
| Create family | 3 per IP per day |
| Login | 5 per family-code/username/IP per 15 minutes; 30 per IP per hour |
| Join | 10 per IP per hour; 5 per invitation per 15 minutes |
| PIN reset verification | 5 per token and IP |
| Authenticated reads | 120 per session per minute |
| General writes | 30 per session per minute |
| Create orders | 10 per member per minute |
| Wallet mutations | 10 per member per minute |
| Invitation creation/rotation | 5 per owner per hour |
| Receipt or proof upload | 10 per member per hour |
| Platform support API | 60 per operator per minute |
| Realtime connections | 2 active connections per session |

Return 429 with Retry-After. Limits are adjusted from production telemetry, never removed to fix an incident.

## 11. Frontend architecture

### 11.1 Route groups

~~~text
app/
  (public)/
    page.tsx
    connexion/
    creer-famille/
    rejoindre/
    invitation/[token]/
  (workspace)/
    layout.tsx
    membre/
    acheteur/
    famille/
      membres/
      portefeuille/
      abonnements/
      parametres/
    commandes/
    services/
  (platform)/
    support/
  api/v1/
~~~

The workspace layout resolves the session on the server and redirects by role. Client components receive a SafeSession DTO containing memberPublicId, role, displayName, familyDisplayName, locale, and entitlements—never family_id.

### 11.2 Core providers and modules

- SessionProvider: safe session, logout, expiry, and role
- WorkspaceProvider: family display settings and entitlements
- QueryProvider: TanStack Query or equivalent focused resource cache
- RealtimeProvider: one authorized connection and event-driven invalidation
- RoleGate: presentation only; APIs and RLS remain authoritative
- Money components: integer-cents formatting only
- OrderComposer: local draft, server-authoritative submit
- FamilyMemberManager: invitation and access management without PIN visibility
- BuyerQueue: pending and active family orders
- WalletLedger: cursor pagination and immutable entry display
- SubscriptionCenter: family fund and personal plan flows
- SupportReferenceCard: lets the Family Owner copy support_ref without exposing tenant identifiers

### 11.3 State strategy

- Server Components provide initial safe data for route entry.
- Query cache keys use user-visible scopes such as orders/me, not family_id.
- Non-money controls may use optimistic UI.
- Wallet balances, order completion, subscription activation, and role changes wait for the committed server response.
- Forms carry idempotency keys generated once per user intent.
- A reconnect fetches missed family_events by sequence, then resumes realtime.
- No full application state endpoint is retained.

### 11.4 Role-based navigation

**Owner**

- Home
- Orders
- Services
- Family wallet
- Members
- Subscriptions
- Settings

**Buyer**

- Purchase queue
- Active purchase
- Completed deliveries
- Earnings
- Own profile

**Member**

- Catalog
- Checkout
- My orders
- Services
- My wallet
- Subscription
- Settings

Platform support is a separate application surface and is never shown in family navigation.

### 11.5 Realtime behavior

- Database transactions write a sanitized family_event.
- A database trigger or worker broadcasts event_type, entity_public_id, and sequence.
- The channel alias is random and session-bound; it is not family_id.
- Realtime authorization confirms auth.uid() belongs to the channel's family.
- The event tells the client what resource to refetch; sensitive business data is not broadcast.
- On connection loss, the interface continues working and performs sequence catch-up.
- A 60-second visible-page heartbeat may check event sequence; it must not download full family state.

### 11.6 Accessibility and localization

- French, Arabic RTL, and English remain first-class.
- Family name and display names support Unicode with NFKC normalization.
- Focus management, keyboard controls, status announcements, and 44-pixel targets remain required.
- Monetary formatting uses MAD and locale, while stored values remain integer cents.
- Error copy does not reveal tenant existence.

## 12. Platform Owner privacy implementation

### 12.1 Operator identity

- Platform operators use a separate identity provider or Supabase project from family users.
- Require passkey or hardware-key MFA.
- No platform operator is inserted into family_members.
- Operator sessions cannot be exchanged for family sessions.
- Operator API credentials cannot call family-data RPCs.

### 12.2 Sanitized observability

Allowed dimensions:

- request_id
- support_ref
- deployment version
- route template, not raw URL
- action code
- result code
- latency bucket
- retry count
- row count bucket
- provider status code

Forbidden dimensions:

- family name or join code
- member name or username
- PIN or hash
- product or service name selected by a family
- order note
- wallet balance or amount
- receipt/proof path
- push endpoint
- complete IP address
- raw request or response body

Application logging uses an allowlist serializer. Unknown fields are dropped, not logged by default.

### 12.3 Infrastructure administrator distinction

The Platform Owner application role is technically prevented from viewing family content. A database project super-administrator remains an infrastructure-level capability and must not be used for routine support. It is protected by separate credentials, MFA, access logging, and a documented emergency process.

If DarnaFlow later requires cryptographic protection even from infrastructure administrators, introduce per-family envelope encryption with keys outside Supabase. That is a separate end-to-end encryption project because it changes search, analytics, recovery, and server-side calculations.

## 13. Migration strategy

### 13.1 Migration objectives

- Preserve all current household data and relationships.
- Make the current household the first family.
- Produce deterministic count and money reconciliation.
- Keep rollback possible before public family creation.
- Avoid destructive schema changes during the observation window.

### 13.2 Pre-migration inventory

Capture:

- Counts for family_users, family_sessions, products, carts, cart_items, and app_meta
- Counts by role and cart status
- Sum of requested and actual order totals
- Family wallet effective balance and transaction count
- Every personal wallet balance and transaction count
- Service task, payment, membership, vote, trial, and fund totals
- Receipt and proof object count plus SHA-256 checksum
- Push subscription count
- Current plan state and monthly budget

Store the signed migration manifest outside the production database.

### 13.3 Legacy mapping

| Legacy source | Target |
| --- | --- |
| One implicit household | One families row with a new internal UUID and random support_ref |
| family_users role admin | family_members role owner |
| family_users role delivery | family_members role buyer |
| family_users role member | family_members role member |
| family_users password_hash | app_private.member_credentials with legacy algorithm marker |
| family_sessions | New tenant-bound sessions or deliberate forced re-login |
| products | family_products belonging to the first family |
| carts | orders |
| cart_items | order_items with immutable snapshots |
| family_wallet_v1 | Family wallet plus wallet_entries |
| member_wallet_USER_ID | Personal wallet plus wallet_entries |
| family_services_state_v1.tasks | service_requests and status events |
| family_services_state_v1.payments | subscription_payment_requests |
| family_services_state_v1.memberships | family_subscriptions or member_subscriptions |
| family_services_state_v1.votes | family plan preference records |
| family_services_state_v1.family_fund_cents | subscription_fund wallet balance and entries |
| family_services_state_v1.trial_used_by | member trial history |
| family_monthly_budget_cents | family budget/settings record |
| delivery_wallet_paid_cents | Buyer settlement ledger |
| cart_service_fee_CART_ID | orders.service_fee_cents |
| offline_purchase_CART_ID | orders acquisition/source flag |
| cart_payment_method_CART_ID | order payment method snapshot |
| cart_wallet_scope_CART_ID | orders.wallet_id mapping |
| cart_created_by_CART_ID | orders.created_by_member_id mapping |
| cart_requested_date_CART_ID | order requested/purchased date |
| cart_receipt_CART_ID | order_receipts and copied storage object |
| member_favorites_USER_ID | member_favorites rows |
| delivery_push_subscriptions | push_subscriptions for the first Buyer |
| profile-images/user-USER_ID | Family-partitioned profile object |
| plan proof objects | Family-partitioned subscription proof objects |

Migration mapping tables store legacy numeric IDs to target UUIDs and make every backfill idempotent.

### 13.4 Phased execution

#### Phase M0: backup and freeze contract

- Take a Supabase backup and storage inventory.
- Record migration manifest and checksums.
- Deploy code that keeps legacy behavior unchanged.
- Announce a short final-write maintenance window in advance.

#### Phase M1: additive schema

- Create new schemas, types, tables, indexes, RLS functions, and policies.
- Add mapping tables in app_private.
- Do not change existing routes.
- Run RLS negative tests against empty target tables.

#### Phase M2: seed first family and identities

- Create the first family.
- Map current Youssef admin to Owner, Josef delivery to Buyer, and active/archived members to equivalent states.
- Copy credential hashes with algorithm metadata.
- Create family, subscription-fund, and personal wallets.
- Validate exactly one active Owner and Buyer.

#### Phase M3: business-data backfill

- Copy products, carts, items, receipts, favorites, budgets, wallet entries, services, payments, memberships, votes, trials, push subscriptions, and proofs in bounded batches.
- Use deterministic idempotency keys based on legacy source and ID.
- Preserve original timestamps and history.
- Copy files before changing any references.

#### Phase M4: reconciliation

For the first family, require:

- User counts match by status and role.
- Product counts match.
- Cart/order and item counts match by status.
- Every order total and service fee matches.
- Family wallet balance and total credits/debits match exactly.
- Every personal wallet balance matches exactly.
- Task, payment, membership, vote, trial, and fund counts/totals match.
- Every receipt/proof checksum matches.
- No target row has NULL family_id.
- No composite foreign-key failure exists.
- Cross-family test fixtures cannot read or reference first-family data.

Any mismatch stops the migration.

#### Phase M5: shadow reads and dual writes

- New repositories read target data in shadow mode and compare normalized results with legacy responses.
- User-facing reads remain legacy until comparisons pass.
- Enable dual writes for current-family actions.
- Transactional outbox records any secondary-write failure for retry.
- Run for at least seven days of normal family use.

#### Phase M6: first-family cutover

- Enter a short maintenance window.
- Stop writes.
- Replay and reconcile the final delta.
- Rotate sessions and require re-login.
- Enable new auth, RLS-backed APIs, and workspace frontend for the first family.
- Run smoke tests as Owner, Buyer, and Member.
- Reopen writes only after reconciliation passes.

#### Phase M7: observation

- Continue dual writing to legacy where semantically possible.
- Monitor error codes, latency, outbox backlog, ledger invariants, and RLS denials.
- Keep public family creation disabled.
- Keep legacy tables and storage untouched.

#### Phase M8: public multi-family enablement

- Stop legacy dual writes after the observation window.
- Enable Create family and Join family behind a gradual rollout flag.
- Start with invited pilot families.
- Increase rollout only after isolation, reliability, and support metrics pass.

### 13.5 Rollback

Before public family creation:

1. Disable new workspace and API flags.
2. Stop target writes.
3. Replay any successfully committed target-only actions to legacy through the outbox.
4. Re-enable legacy routes.
5. Reconcile counts and balances.
6. Preserve failed target data for investigation; do not delete it.

After public family creation, the legacy schema cannot represent new families. Rollback becomes:

- Disable new signups and writes.
- Restore target database from verified backup or point-in-time recovery.
- Replay durable outbox events.
- Keep a static incident page while validation runs.

Legacy tables are retained read-only for at least 30 days after final cutover, then archived only after a signed deletion review.

## 14. Performance and scalability roadmap

### 14.1 Remove full-state polling

Current behavior loads the entire family state every eight seconds. Replace it with:

- Resource-specific GET endpoints
- Initial server-rendered data
- Sanitized realtime invalidation events
- Query-cache refetch for the affected resource only
- Cursor catch-up after reconnect
- A low-cost 60-second event-sequence heartbeat as fallback

### 14.2 Caching

| Data | Strategy |
| --- | --- |
| Public plan catalog | CDN cache, 5 minutes, stale-while-revalidate |
| Global product reference catalog | CDN cache and ETag, 5 minutes or provider-defined |
| Family product catalog | Private server cache tagged by internal family ID; invalidate on product change |
| Session and permissions | No shared cache; short per-request memoization |
| Order lists | Client query cache plus realtime invalidation |
| Wallet balances and ledger | No CDN cache; committed response plus realtime invalidation |
| Analytics | Pre-aggregated daily tables; refresh asynchronously |
| Images | Vercel/CDN with versioned immutable URLs after authorization rules permit |

Cache keys containing internal family_id remain server-side. Cache entries must never be shared across tenant contexts.

### 14.3 Database efficiency

- Vercel and Supabase run in the nearest compatible region to minimize latency.
- Use Supabase's pooled endpoint for serverless workloads.
- Limit selected columns; never use SELECT * in runtime repositories.
- Paginate orders, ledger, services, and audit history.
- Replace per-row queries with set-based queries.
- Precompute dashboard aggregates.
- Set statement timeouts for interactive routes.
- Track slow-query fingerprints without parameter values.
- Review indexes with production-like data.
- Archive old family_events and notification attempts by retention policy.

### 14.4 Background work

Move these out of request latency:

- Push notification delivery
- Reminder campaigns
- Product catalog synchronization
- Image validation and derivative generation
- Analytics aggregation
- Subscription expiry processing
- Failed outbox retries

Workers use idempotent jobs, bounded retries, exponential backoff, and dead-letter queues. Worker roles remain family-scoped for tenant payload processing.

### 14.5 Infrastructure baseline

Production launch baseline:

- Vercel Pro for commercial use, functions, logs, and scaling
- Supabase Pro with pooled connections, backups, and adequate compute
- Separate production and staging Supabase projects
- Production and staging secrets stored separately
- Managed distributed rate limiter
- Error monitoring with field allowlist and PII scrubbing
- Uptime monitoring on public health endpoints
- Alerts for 5xx rate, p95 latency, database CPU, pool saturation, outbox lag, realtime disconnects, failed billing webhooks, and RLS denial spikes

### 14.6 Load-test plan

Use k6 or an equivalent tool against staging populated with synthetic families only.

#### Dataset

- 100 synthetic families
- 5–12 members per family
- One Owner and one Buyer per family
- 100–500 products per family
- 500 historical orders per family
- 1,000 wallet entries per family
- Services and subscriptions at realistic distributions

#### Traffic mix

- 55% catalog and order-list reads
- 15% order creation/editing
- 10% Buyer queue and item updates
- 5% order completion
- 5% wallet/subscription actions
- 5% service actions
- 3% login/join
- 2% owner administration

#### Stages

1. 0 to 50 virtual users over 2 minutes
2. Hold 50 for 5 minutes
3. 50 to 200 over 5 minutes
4. Hold 200 for 20 minutes
5. Spike to 500 for 5 minutes
6. Recover at 100 for 10 minutes

#### Concurrency correctness scenarios

- Fifty simultaneous attempts to debit the same family wallet
- Retried order creation with identical idempotency keys
- Buyer completion racing with member cancellation
- Buyer replacement while an order is active
- Simultaneous family-subscription contributions crossing the target
- Replayed billing webhooks
- Cross-family public ID substitution on every endpoint
- Realtime reconnect with missed sequence range

#### Release gates

- Zero cross-family reads or writes
- Zero lost or duplicated wallet entries
- Zero duplicate orders from retries
- Zero negative wallet balances
- Less than 0.1% unexpected 5xx responses
- p95 read latency below 750 ms
- p95 write latency below 1.2 s
- p99 realtime invalidation below 2 s
- Database CPU below 70% sustained
- Connection-pool utilization below 70% sustained
- Outbox lag below 5 seconds at 200 users and below 30 seconds during the 500-user spike
- System returns to baseline without manual restart

## 15. Implementation roadmap

### Phase 0: safety foundation

Deliverables:

- Architecture decision records
- TenantContext interface
- Structured logging allowlist
- Feature flags
- Staging Supabase project
- Migration inventory and backup procedure

Exit criteria:

- No public behavior changes
- Current tests remain green
- Production backup and restore drill succeeds

### Phase 1: target schema and RLS

Deliverables:

- Additive target migration
- Composite foreign keys and indexes
- RLS helper functions and policies
- Tenant isolation pgTAP tests
- Dedicated runtime and platform roles

Exit criteria:

- All cross-family test cases fail closed
- Runtime role cannot bypass RLS
- service_role is absent from request-path imports

### Phase 2: authentication and family onboarding

Deliverables:

- Family creation
- Invitation link and family-code join
- Scoped username login
- Opaque rotating sessions
- Argon2id PINs and legacy-upgrade flow
- Owner reset flow
- Exactly-one Owner and Buyer enforcement

Exit criteria:

- No family_id in browser payloads
- Brute-force and enumeration tests pass
- Owner cannot obtain or set a final member PIN
- Buyer replacement preserves history

### Phase 3: normalized domain APIs

Deliverables:

- Product/favorite repositories
- Orders and state-machine RPCs
- Wallet ledger RPCs
- Services tables and RPCs
- Subscription and contribution tables
- File authorization endpoints
- Idempotency middleware

Exit criteria:

- Concurrent money tests produce exact balances
- Retries return stable responses
- No route returns full household state

### Phase 4: migration tooling

Deliverables:

- Idempotent legacy mapping and backfill scripts
- File copy/checksum tooling
- Reconciliation report
- Shadow-read comparison
- Dual-write outbox
- Rollback commands and runbook

Exit criteria:

- Current household reconciles exactly
- A second synthetic family cannot access any migrated data
- Restore and rollback rehearsal passes in staging

### Phase 5: role-based frontend

Deliverables:

- Public create/join/login flows
- Workspace shell
- Owner member/account management
- Buyer queue
- Member ordering and services
- Wallet and subscription centers
- Anonymous support reference UI
- French, Arabic RTL, and English verification

Exit criteria:

- Navigation and actions match the authorization matrix
- No sensitive content is hidden only by CSS
- Accessibility checks pass

### Phase 6: realtime, caching, and workers

Deliverables:

- family_events and sequence catch-up
- Authorized realtime channels
- Focused query invalidation
- Catalog caching and ETags
- Notification outbox workers
- Pre-aggregated analytics

Exit criteria:

- Eight-second full polling is removed
- Reconnect catches up without duplicate state
- Cross-family cache and channel tests pass

### Phase 7: migration and first-family cutover

Deliverables:

- Production backup
- First-family backfill
- Reconciliation
- Session rotation
- Smoke tests for all roles
- Observation dashboard

Exit criteria:

- Signed reconciliation report has zero differences
- Current family confirms history and balances
- Seven-day observation has no unresolved P0/P1 issue

### Phase 8: performance and public launch

Deliverables:

- Vercel Pro and Supabase Pro production setup
- Staging load test at 200–500 users
- Security review
- Pilot-family rollout
- On-call and incident runbooks

Exit criteria:

- All performance release gates pass
- All tenant-isolation tests pass
- Backup restore objective is demonstrated
- Public Create family remains behind a rollout flag until approval

## 16. Repository implementation layout

Recommended structure:

~~~text
app/
  api/v1/
    auth/
    family/
    members/
    products/
    orders/
    wallets/
    services/
    subscriptions/
    files/
  (public)/
  (workspace)/
  (platform)/
lib/
  auth/
  tenant/
  db/
    repositories/
    rpc/
  domain/
    orders/
    wallets/
    services/
    subscriptions/
  realtime/
  observability/
  validation/
supabase/
  migrations/
  tests/
scripts/
  migration/
tests/
  integration/
  security/
  e2e/
  load/
docs/
  runbooks/
~~~

Route handlers remain thin. Business rules live in domain services and atomic database functions. Repositories require TenantContext at construction, preventing unscoped queries by API design.

## 17. Testing and release controls

Required automated suites:

- Unit tests for normalization, entitlement, money, and state machines
- SQL constraint and RLS tests
- API role matrix tests
- Cross-family negative tests
- Idempotency and concurrency tests
- Migration count, amount, and checksum tests
- Browser tests for Owner, Buyer, Member, Arabic RTL, and session expiry
- Storage authorization tests
- Realtime channel and reconnect tests
- Platform-log redaction tests
- k6 load tests

CI blocks merge when:

- A tenant table lacks family_id, forced RLS, or a policy.
- A tenant foreign key omits family_id.
- A route imports the service-role database client.
- A response schema contains family_id.
- A log call contains a forbidden field.
- Migration reconciliation fixtures differ.
- Cross-family tests fail.

## 18. Operational runbooks

Before public launch, document:

- Suspected tenant-data leak response
- Lost or stolen Owner device
- Buyer replacement
- Wallet reconciliation
- Billing webhook replay
- Realtime degradation fallback
- Database saturation
- Failed migration rollback
- Receipt/proof malware or invalid upload
- Family export and deletion
- Backup restore and point-in-time recovery

A suspected cross-family leak is a P0 incident: disable affected endpoints, preserve logs, rotate relevant credentials, investigate scope, and do not restore service until isolation tests prove the fix.

## 19. Definition of done

DarnaFlow is ready for public family onboarding only when all statements are true:

- The current household is migrated with exact count, money, and file reconciliation.
- Every tenant table is family-scoped with forced RLS.
- All tenant relationships use composite family foreign keys.
- Runtime routes do not use service_role.
- No API, cache, realtime event, URL, or log exposes family_id.
- The Platform Owner UI cannot retrieve identifiable or financial family data.
- Family Owners cannot view PINs or impersonate members.
- Exactly one active Owner and Buyer are enforced in PostgreSQL.
- Wallet and order concurrency tests show no lost or duplicate writes.
- The eight-second full-state refresh is removed.
- The 200-user hold and 500-user spike tests meet release gates.
- Backup, rollback, and incident procedures are rehearsed.
- Vercel Pro and Supabase Pro production projects are configured.
- Public onboarding is enabled gradually behind a feature flag.

Until then, the current household remains the only production family.
