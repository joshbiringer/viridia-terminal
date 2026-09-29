# Viridia Terminal: Product Rollout Log

Each development cycle ships exactly five phases, in order, and records here what changed, what was verified, what broke, and what comes next. Read this file before starting a cycle.

---

## Cycle 1

**Dates:** 2026-09-25 to 2026-09-28
**Commits:** `116d21a` (Phase 1), `477e797` (Phase 2), `84e7417` (Phases 3–4), `a24a616` (Phase 5)
**Deployed:** production (Vercel, from `main`)

### Starting point (audit)

Viridia already had a disciplined visual base: consistent color tokens, tabular numbers, restrained accents. The research engine was real: security master, daily bars, pivots, rule-validated wave counts, Fibonacci zones. The product around it was not finished:

- **No accounts at all.**
  - The avatar was a hard-coded "V".
  - "Sign in" on the landing page was unclickable text.
  - Watch and Alert buttons were permanently disabled.
- **No retention loop.** There were no watchlists, saved preferences, onboarding or first-run state.
- **No funnel.** Every landing CTA went to `/terminal`, so nothing converted a visitor into an account and nothing was measured.
- **The shell repeated itself.** The top nav duplicated the sidebar. The collapsed sidebar was a blank strip. Eight "Soon" links opened placeholder pages. Symbol pages had four dead tabs and three disabled buttons.
- **App pages used marketing-size headings** (44px display type).
- **Radii drifted:** 9, 10, 12, 14, 16 and 18px were all in use.

### Phase 1: Design system

- **Problem:** Radii and heading scales drifted; controls lacked focus and loading states; recurring patterns such as page headers, empty states and settings rows were rebuilt ad hoc.
- **Objective:** One coherent system that every surface draws from.
- **Implementation:**
  - Tokens:
    - three radii (`--r-sm/md/lg`);
    - one easing curve and two durations (120 and 180ms);
    - an app type scale (`page-title`, `page-desc`, `section-title`, `caption`) alongside the marketing scale.
  - Buttons:
    - focus rings;
    - an `aria-busy` loading spinner that keeps the button's width;
    - a `danger` variant.
  - Inputs: invalid and disabled states.
  - New primitives: `.switch` and `.menu`.
  - Components: `PageHeader`, `EmptyState`, `SettingsRow`/`SettingsSection`.
  - One named icon set (`<Icon name="…">`).
  - Marketing gradient band replaced with a solid brand surface.
  - Every hard-coded radius replaced with a token.
- **Validation:** Typecheck, 20 unit tests, production build; visual check on production.
- **Result:** Every app page now opens with the same compact header, and there are no marketing-size headings inside the Terminal.

### Phase 2: Navigation and terminal shell

- **Problem:** Duplicate navigation, dead-end links, a useless collapsed state, and search that handled tickers only.
- **Objective:** Understand Viridia in seconds; move anywhere from the keyboard.
- **Implementation:**
  - **Sidebar** grouped as Home / Markets / Structure / Research / Personal, with Account, Data Sources and Help at the bottom.
    - Icons on every item, and a real 56px icon rail when collapsed (the `[` key toggles it).
    - Unbuilt sections removed from navigation. Their pages remain reachable from the roadmap.
  - **Top bar:** brand, a wide command search, theme toggle, and account menu.
  - **Account menu:** name and email, then Account, Preferences, Shortcuts, Help and Sign out.
  - **⌘K palette:**
    - lists pages and actions alongside securities: theme, sidebar, sign in and out, and on security pages Ask Viridia, Watch and chart timeframe;
    - results are grouped, with ARIA combobox semantics;
    - a ticker-shaped query ranks securities first.
  - **Theme:** light, dark or system, following the OS, applied before first paint.
  - **Help page** with keyboard shortcuts.
  - **Skeleton loading** for app pages and security pages.
- **Validation:** Build and tests. Live keyboard test of ⌘K found a bug where keystrokes were dropped (fixed in Phase 5).
- **Result:** One navigation model with no dead ends. The palette reaches every page and the common actions.

### Phase 3: Accounts and Account Center

- **Problem:** No authentication or per-user state.
- **Objective:** Real accounts that feel like a real software company's, without inventing billing or limits.
- **Implementation:**
  - **Supabase Auth** with email and password, via `@supabase/ssr`:
    - pages: `/signin`, `/signup`, `/forgot-password`, `/reset-password`;
    - `/auth/callback` handles both PKCE `code` and `token_hash` links;
    - `?next=` redirects are same-site only;
    - Supabase errors are shown in plain language.
  - **`proxy.ts`** (Next 16's replacement for middleware) refreshes sessions and guards `/account`, `/onboarding` and `/watchlist`. Research pages stay public.
  - **Schema** (`0013_accounts.sql`), with row-level security on every table:
    - `profiles` and `user_preferences`, created by a trigger on signup;
    - `watchlists` and `watchlist_items`;
    - `product_events`: anyone can insert, no one can read, event names are a fixed list, no PII;
    - `my_watchlist()` RPC;
    - self-service `delete_my_account()`.
  - **`/account`** sections:
    - **Overview.**
    - **Profile:** name autosaves with "Saved ✓"; email change goes through confirmation.
    - **Plan & Billing:** free beta; no card, invoices or renewal, because none exist.
    - **Usage:** real counts, no invented limits.
    - **Notifications:** choices are stored and clearly marked "not delivered yet".
    - **Security:** change password, sign out other devices; two-factor marked not available.
    - **Preferences:** theme, default timeframe, default wave degree, chart density and landing page. All five are applied in the app.
    - **Data & Privacy:** JSON export and account deletion.
  - `src/lib/plan.ts` is the single source for plan copy. It names no prices or limits.
- **Validation:**
  - Build and 5 new auth tests (open-redirect protection, error mapping).
  - Live: protected routes redirect to sign-in with `next` preserved.
  - The Supabase security advisor flagged the signup trigger function as callable over the API; fixed with `0014`.
- **Result:** Accounts, preferences and the Account Center are live. The only thing left is Supabase's URL setting (see Unresolved).

### Phase 4: Onboarding and activation

- **Problem:** Nothing turned a visitor into an account or a first-time user into a returning one.
- **Objective:** Visitor → account → first analysis → watchlist, in as few steps as possible.
- **Implementation:**
  - **Onboarding** in 3 steps, each changing something real:
    1. Market focus. This drives the suggestions in step 3. An optional first name is asked here too.
    2. Analysis style. This sets the default chart timeframe and wave degree, and the page states the result.
    3. First watchlist. Suggestions are the day's most actively traded names, not a fixed list.

    It ends on the user's first analysis, with a one-time orientation guide.
  - **Watchlist** (`/watchlist`): trend, intermediate swing structure, zone count, 52-week position and dollar volume. Add with inline search, remove in one click, and an empty state that explains what the list is for.
  - **Watch button** on security pages. The toggle is optimistic. Signed-out visitors go to signup and are returned to the same security afterwards.
  - **Home first-run panel** for visitors and signed-in users with no watchlist.
  - **Security pages:** four dead tabs and the disabled Alert and Compare buttons removed.
  - **Landing page:** working Sign in; "Start free" is the primary CTA, with "Explore the Terminal" (no account needed) as secondary; pricing copy is honest about the beta.
  - **Funnel events:** `landing_view`, `signup_started`, `signup_completed`, `signin_completed`, `onboarding_started`, `onboarding_completed`, `ticker_searched`, `analysis_viewed`, `watchlist_created`, `watchlist_item_added`.
- **Validation:** Build and tests. Live: signed-out Watch leads to `/signup?next=/terminal/NVDA`; signup and onboarding routes render.
- **Result:** The whole activation path exists end to end. The signed-in flow has not been run on production (see Unresolved).

### Phase 5: Polish, QA, conversion review

**QA performed on production** (built-in browser; 1440, 1280 and 375px; light and dark):
- Home, security page (NVDA), Fibonacci, signup, and protected-route redirects.
- ⌘K driven from the keyboard.
- Console errors: none. Horizontal overflow at 375px: none.
- Funnel events verified in `product_events` after live visits: `landing_view`, `signup_started`, `ticker_searched`, `analysis_viewed`. All were recorded anonymously, as designed.
- After the fixes deployed: ⌘K → "nvda" → Enter opens `/terminal/NVDA` from the keyboard alone.

**Bugs found and fixed (`a24a616`):**
- The palette dropped keystrokes typed right after ⌘K, because the input took focus 10ms late.
- The mobile top bar squeezed the search box into an unusable sliver. Below 640px it is now an icon.
- Home showed three search entry points at once. The header button was removed.
- The chart kept two disabled "planned" overlay toggles. Removed.
- Fibonacci zone ranges wrapped onto two lines. Fixed.
- Menus faded in from fully transparent, so a stalled animation could hide them. They now start at 60% opacity.

**Vibe-code check:**

| Item | Status |
|---|---|
| Hard-coded avatar | Removed |
| Dead tabs and buttons | Removed |
| Marketing-size headings in the app | Removed |
| Gradient band | Removed |
| Inconsistent radii | Removed |
| Fake plans, prices, usage limits, notifications | None exist |
| Emoji icons, glassmorphism, purple AI gradients | Not present |

### Files modified

**App routes**
- `src/app/(app)/`: `layout.tsx`, `loading.tsx`, `help/`, `watchlist/`, `account/*` (9 files).
- Updated pages: `terminal/page.tsx`, `terminal/[symbol]/page.tsx` + `loading.tsx`, `markets/*`, `research`, `scanner`, `data-sources`, `analysis/fibonacci`, `analysis/rulebook`, `[...slug]`.
- `src/app/(auth)/*`, `src/app/(onboarding)/*`, `src/app/auth/callback/route.ts`.
- `src/app/(marketing)/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/proxy.ts`.

**Components**
- New: `AccountMenu`, `FirstRun`, `SecuritySearch`, `TrackEvent`, `ViewerProvider`, `WatchButton`, `WatchlistView`, `WelcomeGuide`.
- New folders: `account/*` (6 files), `auth/AuthForm`, `onboarding/Onboarding`, `ui/*` (3 files).
- Updated: `CommandPalette`, `TerminalSidebar`, `TopNav`, `Icon`, `PriceChart`, `WaveCounts`, `AskViridiaPanel`, `MarketStrip`, `marketing/HeroTerminalMock`.

**Libraries**
- New: `auth.ts`, `plan.ts`, `theme.ts`, `track.ts`, `watchlist.ts`, `supabase/client.ts`, `supabase/server.ts`.
- Updated: `nav.ts`.

**Database:** `supabase/migrations/0013_accounts.sql` (includes the `0014` revoke).

**Tests and config:** `tests/auth.test.ts`, `vitest.config.ts`, `package.json` (`@supabase/ssr`, `vite`).

### Tests

- **TypeScript:** clean.
- **Unit tests:** 25 passing (engine 20, auth 5).
- **Production build:** clean.
- **Lint:** no ESLint config exists in the repo (see tech debt).
- **Integration and E2E:** none exist yet.
- **Browser QA:** listed under Phase 5.
- **Supabase security advisor:** run after the migration. One real finding, fixed.

### Unresolved

1. **Signup confirmation emails and password-reset links point to the wrong address.** Supabase's Site URL and redirect allow-list haven't been set to the production domain yet, so those email links fall back to the default address. It needs a dashboard change, and the browser was not signed in to Supabase.
   - Set Site URL: `https://viridia-terminal-ten.vercel.app`
   - Add redirect URL: `https://viridia-terminal-ten.vercel.app/**`
2. **Public signups need custom SMTP.** Supabase's built-in email service only delivers to the project's own team members. Either:
   - configure custom SMTP (for example Resend or Postmark), or
   - turn off "Confirm email" (a security and product decision for Josh).
3. **The signed-in flow was not exercised on production.** Onboarding, the Account Center, Watchlist, preference saving and account deletion are type-checked and built. Creating an account on a production site is outside what the QA agent may do, so the first real signup should be Josh's own.
4. **Google sign-in** needs OAuth credentials created in Google Cloud and added to Supabase.
5. **Two-factor authentication** is marked "Not available yet". Supabase supports TOTP, so it is a straightforward next step.
6. **Alerts don't exist.** Notification preferences are stored, but nothing is sent.

### UX observations

- The Terminal is useful signed-out, which is right for credibility. The account's value (watchlists, defaults) is now visible at the moment of need: the Watch button and the first-run panel.
- The sidebar at 1440px is calm and scannable. With 11 items, there's room to add Alerts and Portfolio when they ship without crowding.
- The security page is the strongest surface, but its right column is long. A condensed "Structure at a glance" header (preferred count, invalidation, nearest zone) would deliver the core insight above the fold. That requires Phase 7 ranking.
- Tables on Fibonacci and Scanner wrap long names and degrees at 1280px. Column priorities need tuning.

### Conversion observations

- **Hypothesis:** letting visitors use the Terminal without an account, while asking for signup at the moment of intent (Watch), converts better than a gate.
  - Metric: `analysis_viewed` → `signup_started` rate, and `signup_completed` / `landing_view`.
  - The events are now recorded. No baseline exists yet.
- The landing page leads with "Start free" and says "No card required" twice. There are no paid plans to upsell, so no upgrade prompts were added. Adding them now would advertise features that don't exist.
- The biggest remaining conversion risk is unresolved item 1: a visitor who signs up today may never get a working confirmation email.

### Technical debt

- **No ESLint config or CI.** GitHub → Vercel builds are the only gate. Add `eslint.config.mjs` (next/core-web-vitals) and a GitHub Action running typecheck, tests and build.
- **No E2E tests.** Add Playwright tests for sign-in → onboarding → watchlist against a Supabase branch database.
- **The repo doesn't hold the whole backend.** Only migrations 0011–0013 are in it. Earlier migrations and the `sync-security-master` and `market-data-worker` function sources live only in Supabase. Pull them into the repo.
- **Deploying Edge Functions means re-sending every engine file by hand.** A GitHub Action with a Supabase access token would automate it, at the cost of one secret entered once.
- **Many public `SECURITY DEFINER` market-data RPCs.** Intentional public reads, but they should be reviewed and documented.
- **Database size:** about 366 MB of the 500 MB free tier, mostly price bars. Needs a retention or plan decision.
- **The app layout reads cookies**, which makes every app page dynamic. That is acceptable today but blocks static caching of public research pages.

### Recommended Cycle 2 phases

1. **Wave ranking and "Structure at a glance".** Engine Phase 7:
   - rank rule-valid counts by guideline evidence, including volume personality (see `viridia-wave-knowledge.md`);
   - show the preferred count, the alternate, the invalidation level and the nearest zone at the top of every security page.

   This is the product's core insight and its biggest remaining gap.
2. **Alerts.** Zone reached, invalidation triggered and target reached, for watchlist securities, delivered by email. The notification preferences already exist, so this closes the retention loop.
3. **Auth hardening and trust.** Custom SMTP, Google sign-in, two-factor authentication, and E2E tests of the whole signed-in path. It needs Josh's credentials for SMTP and Google.
4. **Scanner 2.0.** Structure filters (potential wave 3 or 5, ABC completion, near a zone, near invalidation), built on the cached candidates and zones, with saved scans for signed-in users.
5. **Engineering foundation.** ESLint and CI, Playwright, all migrations and Edge Functions in the repo, automated function deploys, and a database size plan.

---

## Cycle 2

**Date:** 2026-09-28
**Commits:** `e075f77` (Phases 1–2), `0e0b7f3` (Phase 3), `c27769e` (Phases 4–5)
**Deployed:** production. Migrations 0014, 0015 (+0015b, 0015c).

Recorded after the fact at the start of Cycle 3; the commit messages are the primary record.

1. **Pattern Confidence ranking (rank-1.0.0).** Rule-valid counts ranked by guideline evidence plus wave-personality checks (wave 3 speed and volume, wave 5 volume, alternation in time, start at the prior extreme). The worker sends volume and stores a preferred/alternate summary as scanner columns.
2. **Structure at a glance.** The preferred and alternate counts, invalidation, target and nearest zone at the top of every security page. Also: a shared degree state, the count overlay with its invalidation line on the daily chart, and an engine parity health check (`/api/health/engine`).
3. **Scanner 2.0.** Structure presets (wave 3, 5 or C in progress; correction or five waves complete; near a zone; near invalidation), direction and confidence filters, and a Wave structure column view. `scan_securities` became dynamic SQL (1.8 s down to 0.1 s).
4. **Structure-first home.** Wave structure today, and the highest-confidence structures.
5. **ESLint and CI.** A GitHub Actions workflow for typecheck, lint, tests and build.

Alerts and auth hardening were deferred: Josh asked to focus on the research terminal and leave accounts as they are.

---

## Cycle 3

**Date:** 2026-09-28
**Focus:** The research terminal, per Josh: "skip the account information part for now, focus on building the website." Accounts are left working as they are.
**Commits:**

| Commit | Phase |
|---|---|
| `38749c9` | 1 |
| `f864a4e` | 2 |
| `ef83ebe` | 3 |
| `3a8ce0b` | 4 |
| (this commit) | 5 |

**Deployed:**
- production (Vercel);
- analysis-worker v9;
- migrations 0016 and 0017.

### Audit at the start

- The AAPL page showed "Close call. The top two counts are within 0 points." Its preferred and alternate were the same story: a running flat down, complete, from two different starts. Many counts tied at 71.
- The glance ignored the move since the count's last pivot. For example, a "correction complete, next move up" had already rallied 15%.
- A finished pattern showed "Invalidation: None yet" with no level to watch.
- Ask Viridia was a stub that still said "ranking arrives in Phase 7" and had a disabled input.
- There were no buy or sell signals, even though this is the project's stated goal.
- Provider symbols repeated four times on the Details card.

### Phase 1: Sharper count ranking (rank-1.1.0)

Two new evidence checks, both from Essentials:
- **Alternate waves in Fibonacci ratio**, within 5%: wave 5 to wave 1, C to A, or triangle legs at 61.8%. Essentials calls these relationships more reliable than adjacent ones.
- **Running flats are rare**, so a running flat now counts against the count.

The alternate is now the best-ranked count that tells a different story, meaning a different pattern family, wave or direction. If every count tells the same story, the card says so.

The glance gained three things:
- a **Reassess** level for finished patterns: the pattern's end, beyond which its last wave is still extending;
- the move since the count's last pivot, and whether it is going the way the count expects;
- how many of the rule-valid counts agree on direction.

### Phase 2: Wave setups (buy and sell signals, setup-1.0.1)

A setup restates the preferred count as a trade.

**Kinds**
- **Active now:** wave 3, wave 5 or wave C under way; a correction complete; five waves complete. Entry is the close.
- **Waiting for entry:** a wave 2 pullback (entry at 61.8%), a wave 4 pullback (38.2%) or a zigzag wave B bounce (61.8%). Pullbacks are for impulses only. The entry widens to a confluence zone when one contains it.

**Levels**
- **Stop:** a hard-rule level, or the end of a finished pattern (labeled as not a rule).
- **Target:** the count's own Fibonacci relationship.

**Gates.** There is no setup when:
- the count defines no stop or target;
- the stop or target lies on the wrong side of the entry;
- price has already crossed the stop or reached the target;
- a waiting entry has already been passed;
- reward:risk is below 1:1.

The card says which of these applies in plain language.

**Cautions** appear for:
- wave 5 (late in the trend; the Article's "reduce risk");
- counter-trend trades;
- close calls.

**Where it shows**
- a Wave setup card on each security page;
- a new **Setups** screen (`/setups`) filtered by side, status, kind, R:R, confidence, liquidity and weekly alignment.

Everything is labeled as research output, not a recommendation.

**QA fix.** The first live data (setup-1.0.0) showed setups with 70–98% risk and R:R below 0.5, where wave C or 5 was nearly finished. It also showed a diagonal wave 4 "pullback" with R:R 22.9 that projected wave 5 = wave 1, which a contracting diagonal forbids. Both were fixed in setup-1.0.1.

### Phase 3: Ask Viridia answers from the engine

Deterministic answers, built only from the engine's results and the source material:
- why this count is preferred (points, rule tally, checks met and not met);
- what invalidates it;
- the Fibonacci targets and nearest zones;
- the alternate, and what would promote it;
- the setup;
- what the wave in progress is usually like (wave personality from the Article and Essentials, cited);
- weekly versus daily;
- what changed since the last session.

Typed questions route to these. Anything else gets a plain statement of what it can answer. Answers follow the page's degree.

### Phase 4: Weekly alignment and daily history

- `analysis_history` records one row per security per session: the preferred daily count, score, level and setup. It is written by a trigger, seeded today and pruned at 180 days.
- The glance card shows the weekly count and whether it points the same way.
- Setups can be filtered to those with or against the weekly count.

### Phase 5: QA, data fixes, roadmap

- Provider symbols are deduplicated.
- Roadmap statuses on Data Sources are updated (ranking, overlays, scanner and setups are live; backtesting is next).
- Stale "Phase 7" text is removed from the rulebook.
- The analysis worker now runs every 2 minutes instead of 5, so the full recompute takes hours rather than a day.

### Files

**New**
- `supabase/functions/_shared/engine/setup.ts`
- `src/lib/analysis/explain.ts`, `setups.ts`, `setup-scan.ts`
- `src/components/analysis/SetupCard.tsx`, `SideChip.tsx`
- `src/app/(app)/setups/page.tsx`
- `supabase/migrations/0016_setups.sql`, `0017_history_alignment.sql`
- `tests/setup.test.ts`, `tests/explain.test.ts`

**Changed**
- Engine: `rank.ts`, `glance.ts`, `candidates.ts`, `analyze.ts`, `version.ts`
- Worker: `analysis-worker/index.ts`
- Components: `AskViridiaPanel.tsx`, `StructureGlance.tsx`, `WaveCounts.tsx`
- `src/lib/analysis/{candidates,server}.ts`
- Symbol, data-sources and rulebook pages
- `src/lib/nav.ts`, `Icon.tsx`, `vitest.config.ts`, `package.json` (`bundle:worker`), `.gitignore`

### Tests

- **Automated:** 51 unit tests pass (35 before). TypeScript, lint (0 errors) and the production build pass.
- **Live on production**, checked on NVDA and `/setups`:
  - no console errors;
  - no horizontal overflow at 375px;
  - the glance shows the reassess level, the move since the pivot, agreement and the weekly direction;
  - the setup card reads SELL, correction complete, R:R 3.5, 4.3% risk;
  - Ask Viridia's weekly, invalidation and what-changed answers render;
  - `/setups` lists 222+ setups while the recompute runs.
- **Engine parity:** `/api/health/engine` shows the worker's stored result and the app's live computation match (candidates and zones) at `…+rank-1.1.0+setup-1.0.1`.

### Unresolved

- **Recompute in progress.** At the time of writing, about 975 of 4,031 daily analyses were on the new engine, most-traded first. Setups and structure filters fill in as it runs.
- **Worker deploys are manual.** The analysis worker is deployed as a bundle (`npm run bundle:worker`) through the Supabase connector. It needs a Supabase access token in GitHub secrets to deploy from CI.
- **Database size:** 425 MB of 500 MB. The history adds about 0.5 MB a day. `price_bars` (302 MB) needs a retention decision soon.
- **"What changed" has no previous day yet.** It starts working after the next session.
- **Weekly and daily are counted independently.** Multi-degree reconciliation is a later engine phase.
- **Setups are not backtested.** The R:R and confidence gates are geometric, not proven profitable.
- Carried over from Cycle 1: Supabase Site URL and SMTP, and the untested signed-in flow on production.

### Recommended Cycle 4 phases

1. **Backtesting framework.** Replay setups and the preferred count's calls historically, with no look-ahead, to measure hit rate by setup kind. This is needed before anyone trusts the signals.
2. **Setup chart overlay.** Draw the entry, stop and target on the price chart, with the alternate count's path.
3. **Multi-degree reconciliation.** Check that waves 2 and 4 subdivide into threes at the lower degree, and reconcile weekly and daily counts into one.
4. **Database plan.** Retention for price bars, and CI deploys for the worker.
5. **Alerts for watchlists,** when accounts come back into scope: setup triggered, stop hit, target reached.

---

## Cycle 4

**Date:** 2026-09-28
**Direction:** Josh's positioning directive, saved as `docs/viridia-positioning.md`. Viridia becomes the intelligence terminal for advisors, RIAs and asset managers: "from market signal to client conversation." Every cycle from here should read it.

**Commits**

| Phase | Commits |
|---|---|
| 1 | `16cca3e`, `02e76d0` |
| 2 | `7c259e3` |
| 3 | `a31fab0`, `cf8c0df` (QA fix) |
| 4 | `783a5b3` |
| 5 | `842fe88`, `aefa2da`, this commit |

**Migrations:** 0018, 0018b, 0019, 0019b, 0020.

### Choosing the phases

The directive describes six stages. This cycle took the parts that are buildable now with data Viridia actually has:
- **Stage 1**, the research terminal: made trustworthy with a backtest, and given context through Signals.
- **Stage 2**, portfolio intelligence: Portfolio X-Ray.
- **The four questions** ("What changed? Why does it matter? Where should I look? How do I communicate it?"): the Brief and "Explain to client".

Client households, meetings, CRM, IC workspace and model portfolios need data sources and integrations that don't exist yet. They are labeled "Planned" on the landing page, not mocked.

### Phase 1: Setup track record (backtest-1.0.0)

**Engine** (`backtest.ts`)
- At every fifth session after the first 250, the full engine runs on the bars up to that day only. The setup it would have shown is then followed for 60 sessions.
- The first of stop or target decides the outcome. When one bar touches both, it counts as a stop.
- Other outcomes:
  - **Expired:** marked to the close at the end of the window.
  - **Missed:** a waiting entry that never filled.
  - **Pending:** the window isn't over yet, so it's left out of the stats.
- Results are in R (multiples of the initial risk).
- A test proves there's no look-ahead: changing prices after the last signal doesn't change any signal.

**Where it runs.** `/api/backtest/[symbol]` runs on Vercel. Postgres calls it through pg_net once a minute, 15 securities in flight (`backtest_tick`), and stores the trials. Two reasons for this design:
- It keeps a heavy replay off the analysis worker's edge-function CPU budget.
- It deploys with every push, without a manual bundle.

**Where it shows**
- The Track Record page, by kind and side, with confidence and R:R filters.
- A track-record line on the setup card.
- A "history" tag beside every setup on the Brief and the Setups screen.

### Phase 2: Viridia Signals

A context row on each security page instead of a rating:
- **Structure:** preferred count direction, weekly agreement, close calls.
- **Trend:** 50/200-day.
- **Momentum:** 3-month return and its lead over SPY.
- **Risk:** volatility regime, 1-year drawdown, beta, nearness to the count's level.
- **Fundamentals and Valuation:** marked "Not available yet".

The row ends with that security's own replayed setup history. A shared `stats.ts` module holds returns, volatility, drawdown, beta and correlation.

### Phase 3: Portfolio X-Ray

**Input:** paste or upload holdings. It accepts CSV with headers, plain lines, quoted dollar amounts, total or per-share cost, and US or ISO dates. Duplicates are combined.

**Output**
- value, concentration (largest, top 5, effective holdings, flags over 10% and 20%) and asset mix;
- beta, volatility, drawdown and 3-month return, from today's weights applied to past returns;
- the most correlated pairs;
- unrealized gains and losses, with holding periods;
- each holding's wave structure, weekly agreement and setup.

Holdings are processed per request and never stored.

Not yet available, and stated on the page: sector, factor and geographic exposure, ETF look-through, and income. The security master has no sector data.

**QA fix.** The API's 1,000-row cap truncated daily closes for portfolios with more than a few holdings, so beta, volatility and correlations came back empty. `closes_for` now returns one row per symbol, fetched 8 symbols per call in parallel, inside the 3-second anonymous statement limit.

### Phase 4: Viridia Brief and Explain to client

**The Brief (home page)**
- a greeting by name;
- markets;
- **What changed**, comparing each security's last two recorded sessions, same engine version only:
  - count flips and a count moving on;
  - setups that are new or no longer apply;
  - confidence moves of 10 or more;
  - market-wide over $25M a day, plus your watchlist;
- biggest gains and declines;
- setups to review, each with its kind's history.

**Explain to client:** a toggle in Ask Viridia that rewrites each answer in plain language:
- no Elliott terms;
- the level that would change the view;
- a not-a-recommendation note;
- a Copy button.

### Phase 5: Positioning and QA

**Landing page**
- Hero: "From market signal to client conversation."
- Four outcomes, each linked to a live feature.
- The six modules with honest status: Research and Markets live; Portfolio and AI partly live; Advisor and Enterprise planned.
- The live scanner now shows wave structure.
- Disclosures now cover the track record.
- Roadmap updated.

**Kept on purpose.** The CTA stays "Start free", not the directive's "Request access". The beta is open, so "Request access" would imply a gate that doesn't exist. Switch it when access is actually gated.

### Tests

- **Automated:** 64 unit tests (51 before). New suites cover the backtest (including no look-ahead), stats and Signals, X-Ray parsing and measures, and Explain to client (no jargon, the disclaimer always present). TypeScript, lint (0 errors) and the build pass.
- **Live on production**
  - The backtest route: MSFT returns 6 trials in 1.4 s, and the pg_net pipeline is storing results.
  - X-Ray on a 7-holding example returns in 2.4 s:
    - beta 1.27;
    - QQQ and VGT correlated at 0.96 (this surfaces the fund overlap even without look-through);
    - tax lots computed.
  - The Brief, Track Record and landing page render.
  - No horizontal overflow at 375px.

### Findings to act on

- **Early track record (442 resolved, 120 of 4,000 securities replayed): 20% reached the target first, averaging −0.01R.**
- "Correction complete, sell" is the weakest kind so far: 4% hit, −0.44R across 68 cases. Several of the highest-confidence setups on the Brief today are that kind.
- The replay window is the past year (a rising market), so sell setups are disadvantaged. The sample is still small.
- **Do not tune on this yet.** Wait for the full universe, then consider gating or down-ranking kinds with a negative average result. The history tags already make this visible to users.

### Unresolved

- **The replay is running.** 120 of 4,000 securities were done at the time of writing; the rest takes about 4.5 hours.
- **What changed has no previous session yet.** It fills in from the next session.
- **Stored history is only about 500 daily bars,** so each security's replay window is about one year. A longer history would give a sturdier track record, but it needs database space: 425 MB of 500 MB.
- **No sector or fundamentals data,** which blocks the Signals fundamentals and valuation dimensions and X-Ray sector exposure. SEC data (SIC codes and XBRL company facts) is free and is the likely source.
- Carried over: manual worker deploys, Supabase auth URL and SMTP, database size.

### Recommended Cycle 5 phases

1. **Fundamentals from SEC data.** SIC sector and XBRL company facts (revenue, earnings, margins). This unlocks the Signals fundamentals dimension, X-Ray sector exposure and valuation context.
2. **Setup quality from the track record.** Once the full universe has replayed, rank setups by their kind's history and confidence together, and gate kinds with negative expectancy. Report out-of-sample by splitting by date.
3. **Saved portfolios and models.** Store X-Ray portfolios for signed-in users, set target weights, and flag drift (Stage 2).
4. **Meeting prep, first version.** For a saved portfolio: since last review, holdings with changes, concentration and tax items, talking points and a client version. Everything is built from X-Ray and the Brief, with no invented client data.
5. **Database plan.** Price-bar retention or a plan upgrade, so the history and replay window can grow.

## Mission Control (September 28–29, 2026)

`/terminal` was rebuilt from the Brief into **Mission Control**, following the "what happened, what matters to me, what should I investigate next" critique.

### What shipped

- **Header band.**
  - The globe is compacted into a header band: greeting, "what changed through Friday's close", world sessions and Prepare My Day.
- **Today strip.**
  - Four cells: Market, Research, Portfolio, Clients and calendar.
  - Portfolio, clients and calendars say "not connected" instead of showing placeholders.
- **Ask Viridia command line.**
  - Suggested prompts: explain today's market, find improving structures, compare two tickers, show watchlist changes.
  - A single ticker opens the drawer.
  - Routing is deterministic and every answer is built from stored data. It does not forecast.
- **Market Pulse.**
  - Equities (SPY, QQQ, IWM, DIA), Rates (SHY, IEF, TLT) and Macro (UUP, GLD, USO, IBIT).
  - A 1D / 1W / 1M switch, 30-session sparklines and trend dots.
  - The ETF-proxy disclosure sits in an info tooltip.
- **Market regime.**
  - Uptrend / mixed / downtrend bar, the share above the 50-day average, and 52-week highs versus lows.
  - A generated reading that flags narrow participation.
- **What Changed.** 5–8 developments across the index tape, rates, the largest macro move, breadth, watchlist and market structure changes, and the biggest liquid movers.
- **Market scanner tiles.** Strong structure, near a Fib zone, near a 52-week high, wave 3, correction complete and near invalidation. Each opens the scanner filtered.
- **Setups table.** A compact table of the highest-confidence setups.
- **Right rail.**
  - Watchlist, or the most traded names when signed out: price, day, trend, wave, setup and latest structure event.
  - A portfolio slot (Run X-Ray).
  - Calendar and alerts, marked not connected.
- **Security drawer.**
  - Opens from any ticker on the page and shows price, 1W/1M, trend, daily and weekly count, confidence, invalidation, nearest Fibonacci zone, setup and latest history.
  - Buttons: Open research, Ask Viridia (which opens the panel on the security page) and Watch.
- **Prepare My Day.** A compiled brief (markets, regime, what changed, watchlist, setups, world sessions, not-connected items) with Copy and Print.
- **Moves and navigation.**
  - Most active moved to Markets.
  - The sidebar is regrouped as Terminal, Research, Markets, Scanner, Portfolio and Workspace. There are no dead links.
- **Data layer.**
  - `market_pulse` and `security_preview` RPCs (migration 0021) and `/api/preview/[symbol]`.
  - Market-wide data cached for 5 minutes; the last good copy is kept if a reload fails.

### Incident: database throttled (September 29, morning)

- **Symptoms.**
  - From about 10:00 UTC, pg_cron logged "job startup timeout" on most runs.
  - Reads of cached pages took seconds; breadth took 32 s.
  - The site rendered empty or stalled.
- **Cause.** The backtest replay (15 requests every minute) on top of the morning data and analysis work exhausted the small instance's resources.
- **Action.**
  - The backtest was slowed, then paused (`viridia-backtest` is inactive). It had replayed 2,389 securities.
  - Mission Control now caches market-wide data and shows a notice instead of blank panels.
- **To do.**
  - Resume the backtest off-hours at a low rate: every 3 minutes, 6 requests.
  - Consider a larger Supabase compute size, which is a billing decision.

### Incident follow-up (September 29, 13:40–14:30 UTC)

- **State.** Even with the backtest paused, the database stayed throttled. The pulse query took 70 s (normally 0.3 s) and connections timed out. The market-data and analysis workers were failing with 500s and retrying.
- **Action.**
  - Paused `kestrel-market-data-worker`, `viridia-analysis-worker` and `viridia-snapshot-refresh`.
  - Snapshot refresh moved from every 15 minutes to hourly (`10 * * * *`).
  - A one-off job, `viridia-resume-workers`, re-enables all three at 20:30 UTC (4:30 p.m. ET) and then removes itself.
  - Within about 30 minutes the pulse query was back to 0.4 s and Mission Control loaded again.
- **Effect.** Prices on the site stay at Friday, September 25 until the workers resume. Monday's and Tuesday's bars are fetched after 20:30 UTC.

### Not built (no data source, or later)

- Economic and earnings calendars, clients and meetings, alerts, unusual-volume and trend-change tiles, customizable layouts, and advisor versus asset-manager workspace presets.
