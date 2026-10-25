# WanTone Owner UI/UX Audit — 2026-10-25

## Purpose and scope
Review the **actual rendered Owner routes in source**, not speculative unused UI. The active home view is `focusedHomeView` (not the older unused `homeView` constant); the bottom nav is Home / Changes / Record / Chat / My Page. Read-only code review, **not a usability study or device screenshot test**. No API, DB, RLS, routing destinations, or write logic may change in UI iterations.

Design north star: **"3 seconds to know what's next, 1–2 taps to act"**, 375px-first, off-white/white with `#008661` reserved for meaningful actions/selection. UI should reinforce the benefits of pet observation, not add competing dashboards.

## Findings and priorities

| Priority | Surface | Observed source behavior | User impact | Proposed acceptance |
|---|---|---|---|---|
| P0 | Home → Today's Care | The first summary "お世話" button navigates to `goalsView`, while current, editable `HomeCareGroups` sits below on the **same** active homepage. | Duplicate management surfaces; unexpected navigation. | In-page scroll to `#home-care-day`, preserve toggle/edit and history logic. |
| P0 | Record | Main central Record tab shows only ObservationEventHub. Daily Check appears on Home, but is absent as a first choice in Record. Decorative illustration is placed *before* input actions. | Users cannot discover Daily Check from "記録"; action requires extra search/scroll. | Show explicit Daily Check first action, then Event Log; keep both original forms/routines. Move illustration below the actions. |
| P1 | Home summary | Three 94px cards render 9–10px labels and English LOG/DAYS, at 375px constrained widths. | Labels are harder to scan; summary purpose not obvious. | Text >=11px at 375px; Japanese units; compact 88px tiles, clear focus/interaction. |
| P1 | Changes | Decorative illustration precedes the primary `RecentObservationTrends` visualization, pushing real data below the fold. | User must scroll to see the main reason for visiting. | Render trends before art; keep artwork small, explanatory note intact. |
| P1 | Coaching | Tab design was recently compacted and non-sticky (PR #171). Two important modes remain, but chat includes toolbar, notification prompt, messages, input, and coach card. | Chat's visual hierarchy can still be overwhelming. | Device test: essential tabs visible, composer reachable, gallery intuitive, focus not trapped; no sticky regressions. |
| P2 | My Page | Settings contain dog, owner, family, notifications, membership, support, legal, and destructive account actions in separate sections. | Many sections, but grouping is broadly sound; room for reducing secondary copy and prominence. | Do not reorganize until testing the real scanning flow; destructive actions must stay deliberate. |
| P2 | Styling maintainability | `app/page.tsx` >5k lines, `app/globals.css` >7k lines; old home `homeView` still exists beside rendered `focusedHomeView`. | High risk of editing the wrong view and CSS cascade regressions. | Prefer new scoped components/CSS and regression coverage; remove unused code only in a separate proven-safe refactor. |
| P2 | Accessibility | Scrolling summary controls lack user-facing focus destinations after jumping, and small texts vary. | Keyboard/screen reader comprehension may suffer. | Use descriptive accessible labels, visible focus rings, meaningful headings, at least 44px hit targets; preserve accessibility in dialogs. |

## Phase 1-A implementation (this PR)
- Source-based UI audit and prioritized backlog.
- **Home**: use current in-page Daily Care editor for the top shortcut, compact three summary cards, use plain Japanese counts, keep existing observation/record links.
- **Record**: add Daily Check as explicit, prominent first action in the central Record tab; label separate Event Log choice. Move decorative scene below the interactive selection.
- **Changes**: show `RecentObservationTrends` *before* decorative illustration and reduce the artwork's height.
- No new DB calls, handlers, tables, API changes, member entitlements, or modified persistence routines.

## Phase 1-B candidate sequence
1. **Device usability pass**: iPhone ~375px and ~390px, Android ~360px, tablet; test with empty data, some logs, populated logs, offline; keyboard/VoiceOver and long text.
2. **Owner Coach**: make Coach identity visible near the chat without repeating large cards; show media gallery and notifications only when relevant; verify real conversation and online booking.
3. **Changes**: check Empty/Data/Error loading states and chart/date comprehension; add direct link to full history where appropriate.
4. **My Page**: test existing groups with actual users, then trim repeated explanations; don't hide membership or notification controls.
5. **Design tokens**: consolidate type scale, color, focus, spacing, touch targets into scoped components; remove redundant historic CSS only after screenshots and tests.

## Acceptance criteria
- Central Record offers both Daily Check and Event Log without requiring a visit to Home.
- Homepage Daily Care summary lands on the **already existing** daily care group, not on a duplicate goals manager.
- Latest trends on Changes precede decorative artwork.
- At 375px, top summary labels are legible and buttons remain clearly tappable; no horizontal overflow.
- No changed DB or API; no changed hooks or saving logic; no altered membership/coach gating.
- TypeScript, targeted regression tests, existing Supabase baseline CI, and Vercel preview build pass before main merge.
- Real device screenshots and user usability validation remain a **separate gate**; do not claim that source inspection proves visual quality.

## Metrics to evaluate in manual usability testing
- "Start a Daily Check from the Record tab": one tap from Record screen.
- "Complete a daily care task after seeing Home summary": no intervening page transition.
- "Find trend": immediately visible before decorative image.
- Keyboard-only discoverability, 200% zoom, touch target size, scroll restoration, media gallery return-to-message.
- Measure actual first-action time and scroll depth in testing rather than fabricate quantitative improvements.


## Revised Owner information architecture — Phase 1-B

After the first audit, the product direction changed: **a separate Record destination duplicates what the active Home already offers**. The Phase 1-A recommendations above document the initial implementation, not the final desired navigation.

**New navigation contract:**
- **Home** is the single recording hub. It contains the Daily Check action, today's Event Log topics, care routines and the calendar.
- The **raised central 記録 button** remains to preserve one-tap access anywhere, but is **an action, not another destination**. It opens a compact, accessible chooser: 今日の状態を記録 → original Daily Check form; できごとを記録 → the existing Event Hub on Home.
- **Changes** remains for trends, **Chat** for coach support, and **My Page** for profile/settings. The underlying recordView remains only for existing recording forms and legacy navigation recovery, not as a competing record-selection screen.

**Quality boundaries:** never rewrite Daily Check/Event Log saving, date logic, permissions, RLS, owner/coach messaging, scheduling, calendar storage or the raised recording navigation's visual geometry. Preserve existing historical records.

**Automated acceptance:** central nav opens a dialog rather than the old record route; both choices work, Home retains the original Event Hub and Daily Check, keyboard Escape/Tab supported; the old duplicate record-selection UI is absent. Run TypeScript, lint, baseline regression tests and a Vercel preview. Real-device usability remains to be verified separately.
