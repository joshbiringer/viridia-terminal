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
