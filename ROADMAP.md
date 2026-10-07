# gym-os — 792 Fitness Studio Roadmap

_Last updated: 2026-09-28 · Status: Phase 1 in progress_

---

## Product Context

- Single-gym system for **792 Fitness Studio** (gym + swimming pool).
- Live at **https://gymos.sakhi.app** — branded login: `https://gymos.sakhi.app/login?gym=792`.
- Staff creds: `792fitness@gmail.com` (share with 792 team; do not commit passwords here).
- GST mode: **inclusive** (displayed prices include GST).

## Locked Design Decisions

| Topic | Decision |
|---|---|
| Dual memberships | One active membership per `service_type` (gym + swimming can coexist on one member) |
| Service types | `packages.service_type` = `gym \| swimming \| both` (combo schema-ready, UI later) |
| Terms auto-attach | Package's service_type determines which T&C to sign; combo → both |
| Family/team/school groups | Generic `member_groups` table, any size, one group per member |
| Family pricing | Group-priced packages (total for N members), NOT per-member rates |
| Group payment split | Even split by default, **editable per-member amounts** in UI, sum validated |
| Group receipts | Mode toggle: **individual** (N receipts, member names) or **consolidated** (1 receipt, org `billed_to` + member annexure — for school/company expense booking) |
| Trial / pool-trial rules | **Soft warnings only** (e.g., "trial already extended once") — never hard-block |
| Package edits vs old billing | Membership rows snapshot amount/gst/total at purchase; new column `memberships.package_name` snapshots the name so renames never rewrite history |
| Children ≤10 swim | Same rates as non-member; separate "Swim Kids" packages for clarity |
| Gender-specific offers | Separate packages (e.g., "Swim 1M Female +10d" = 40 days) — no auto-magic, no enforcement |
| Import merge | Phone-based dedup; same phone w/ gym + swim rows → one member, two memberships |
| Permissions | Hardcoded roles (owner/admin/manager/staff/trainer) — no configurable matrix |
| Old Member IDs (legacy) | Ignored — not imported |

## Package Catalog (20)

**Gym (service_type: gym)**
| Package | type | days | Price |
|---|---|---|---|
| Trial 1 Day | trial | 1 | ₹1,000 |
| Trial 10 Days | trial | 10 | ₹5,000 |
| 1 Month Signature | membership | 30 | ₹10,000 |
| 3 Months Signature | membership | 90 | ₹20,000 |
| 6 Months Signature | membership | 180 | ₹30,000 |
| 1 Year Signature | membership | 365 | ₹40,000 |

**Family Annual (service_type: gym, group-priced)**
| Package | days each | Total |
|---|---|---|
| Family Annual (2 Members) | 365 | ₹70,000 |
| Family Annual (3 Members) | 365 | ₹1,00,000 |
| Family Annual (4 Members) | 365 | ₹1,30,000 |
| Family Annual (5 Members) | 365 | ₹1,60,000 |

**Swimming — Gym Member add-on (service_type: swimming)**
| Package | type | days | Price |
|---|---|---|---|
| Swimming Add-on (1 Day) | day_pass | 1 | ₹0 FREE |
| Swimming Add-on (10 Days) | membership | 10 | ₹2,000 |
| Swimming Add-on (1 Month) | membership | 30 | ₹4,000 |
| Swimming Add-on (1 Month) Female +10d | membership | 40 | ₹4,000 |

**Swimming Only — non-member, age 11+ (service_type: swimming)**
| Package | type | days | Price |
|---|---|---|---|
| Swimming Only (1 Day) | day_pass | 1 | ₹600 |
| Swimming Only (10 Days) | membership | 10 | ₹3,000 |
| Swimming Only (1 Month) | membership | 30 | ₹6,000 |

**Swim Kids — age ≤10 (service_type: swimming)**
| Package | type | days | Price |
|---|---|---|---|
| Swim Kids (1 Day) | day_pass | 1 | ₹600 |
| Swim Kids (10 Days) | membership | 10 | ₹3,000 |
| Swim Kids (1 Month) | membership | 30 | ₹6,000 |

_Operational policies (staff-managed, soft-warned): trial extended once only on upgrade · pool trial one-time · male-child slot → male guardian · solo child needs coach approval (Task) · last pool entry 9 PM._

---

## Phases

### Phase 0 — Infra wrap-up ✅ (verify during Phase 1)
- [x] App live on gymos.sakhi.app (user confirmed)
- [ ] Supabase → Auth → URL Configuration: Site URL = `https://gymos.sakhi.app`; add `https://gymos.sakhi.app/reset-password` to redirect URLs (needed for forgot-password + member signing links) — **user must do in dashboard**
- [ ] Share creds with 792 team

### Phase 1 — Schema + Catalog + Import ← **CURRENT**
- [x] SQL migration `005_dual_membership_groups.sql` applied:
  - `packages.service_type` (text, check gym/swimming/both, default gym)
  - `memberships.package_name` (text snapshot)
  - `member_groups` (id, gym_id, name) + `members.group_id` FK + RLS
  - `payments.payment_group_id`, `receipts.payment_group_id` (batch links)
  - `receipts.billed_to` (consolidated receipt org name)
  - **Fixed event_type enum** — added freeze_requested/approved/rejected/ended + import_enrollment (these inserts were silently failing before)
- [x] Seed 20-package catalog via SQL (`supabase/seeds/001_package_catalog.sql`)
- [x] Import wizard: `end_date` field, auto-parse DD-MM-YYYY → ISO, preview shows End Date
- [x] Import API: end_date → back-calc start from package duration; past end → membership `expired` (member stays active); per-package dedup (dual memberships import correctly); package_name snapshot
- [x] Packages page: service_type selector (create + edit), service badges, service filter tabs
- [x] Test CSV: `supabase/seeds/test-import.csv` (14 rows covering dual membership, family, kids, female +10d, expired)
- [ ] User tests import with test CSV → then real file

### Phase 2 — Multi-Membership UI
- Members list: dual-expiry accuracy, 🏋️/🏊 service badges
- Profile 360: Gym card + Swimming card (progress bars "Day 12 of 30", green→amber→red), header access chips (`Gym ✓ Swim ✓`), per-membership Renew
- Dashboard: expiring list per membership

### Phase 3 — Terms Auto-Attach
- Enrollment: T&C selected by package service_type
- sign-terms page: filtered by member's active services
- Profile: per-service terms status + pending-sign CTA

### Phase 4 — Groups + Group Payments
- Group create/link at enrollment; family card on profile
- Group payment flow: pick group package → select N members → even auto-split, editable, sum-validated → receipt mode toggle (individual / consolidated + annexure) → `payment_group_id` batch, void-batch logic
- Family package guard (prompt group selection)

### Phase 5 — Polish & Access Hardening
- Timeline filter chips; notes surfacing; members-list summary chips; bulk WhatsApp reminders
- Hide lifetime financials from staff/trainer (keep dues visible)
- Force password change on first staff login
- Member print one-pager; mobile card view

### Phase 6 — Blocked (external)
- eSSL X2008 gate integration (hardware engineer)
- WhatsApp Business API outbound (Meta approval)

---

## Known Data Notes
- Import file `792_Expiries_Report_*.csv.xls` has columns: Member ID, First Name, Last Name, Phone, Plan, Type, Expiry Date (DD-MM-YYYY). Plan names in file must match catalog names (e.g., "1 Month Signature", "Swimming Only (1 Month)") — normalize before import or rename packages.
- `supabase/cleanup-data.sql` wipes members/payments/packages (keeps users, settings, terms, templates).
