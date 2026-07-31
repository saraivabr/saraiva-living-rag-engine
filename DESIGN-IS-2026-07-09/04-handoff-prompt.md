# Handoff Prompt

````
/make-plan Redesign insta.saraiva.ai Instagram post generation and scheduling console. Current design failed audit at 8/30 with critical gaps in principles #2 useful, #4 understandable, #5 unobtrusive, #6 honest, #7 long-lasting, and #10 as little design as possible.

Verdict paragraph (quoted from 03-verdict.md):
> REDESIGN — The current `insta.saraiva.ai` surface scores 8/30 and fails load-bearing principles for usefulness, understandability, unobtrusiveness, honesty, durability, and restraint; the right move is to redesign the product surface around the upload -> caption -> schedule workflow instead of refining the Instagram-profile shell.

Why redesign and not refine: The current structure frames a production scheduling tool as an Instagram profile clone, mixes legacy local-only controls with real backend scheduling, and buries the primary workflow inside decorative chrome.

Preserve from current design (MUST be non-empty — at minimum, name the brand tokens):
- Secure backend separation and PIN/API pattern from `/tmp/insta-audit-app.js:33-48`.
- Upload -> prepare -> schedule capability from `/tmp/insta-audit-app.js:147-198`.
- Brand tokens only: white background, black text, muted gray, blue/green/orange status accents from `/tmp/insta-audit-styles.css:1-13`.

Discard (MUST be non-empty — name the structural patterns causing the failures):
- Instagram profile imitation: rail, profile metrics, stories, tabs. Evidence: `/tmp/insta-audit-index.html:11-44`, `/tmp/insta-audit-index.html:94-113`. Caused failure on principles #2, #5, #7, #10.
- Duplicate old/new scheduling and publishing flows. Evidence: `/tmp/insta-audit-index.html:86-90`, `/tmp/insta-audit-index.html:144-150`, `/tmp/insta-audit-app.js:249-291`. Caused failure on principle #4.
- Fake or unclear caption promise. Evidence: `/tmp/insta-audit-index.html:82`, `/tmp/insta-audit-app.js:127-131`. Caused failure on principle #6.

Top 3–5 moves from the audit (verbatim):
1. Principle #2 — Useful: Replace the profile/stories/tabs shell with a single upload pipeline: source -> preview -> caption -> schedule. Evidence: 38 interactive elements and unrelated controls at `/tmp/insta-audit-index.html:11-44`, `/tmp/insta-audit-index.html:47-113`.
2. Principle #4 — Understandable: Collapse duplicate scheduling/publishing paths into one backend-backed action model. Evidence: real factory schedule at `/tmp/insta-audit-index.html:86-90`, old localStorage schedule at `/tmp/insta-audit-index.html:144-150`, old `/api/publish` path at `/tmp/insta-audit-app.js:249-291`.
3. Principle #6 — Honest: Rename and wire caption generation honestly: either "Rascunho de legenda" from slug or real vision-generated caption. Evidence: promised suggestion at `/tmp/insta-audit-index.html:82`, generic slug caption at `/tmp/insta-audit-app.js:127-131`.
4. Principle #5 — Unobtrusive: Make uploaded images and scheduling state the primary visual content; remove Instagram cosplay chrome. Evidence: profile/stories/tabs dominate `/tmp/insta-audit-index.html:21-44` and `/tmp/insta-audit-index.html:94-113`.
5. Principle #10 — As little design as possible: Remove every control that does not help upload, review, schedule, or inspect queue. Evidence: rail/profile/actions/stories/tabs/modal legacy actions at `/tmp/insta-audit-index.html:11-18`, `/tmp/insta-audit-index.html:42-44`, `/tmp/insta-audit-index.html:94-113`, `/tmp/insta-audit-index.html:152-157`.

Redesign principles in priority order:
1. Principle #2 — Useful: A user should complete upload -> preview -> caption -> schedule in one clear screen with no unrelated controls.
2. Principle #4 — Understandable: Every control must map to a real backend action or visible local preview; no legacy localStorage-only workflow in the primary path.
3. Principle #10 — As little design as possible: Keep only four product regions: upload source, visual preview, caption editor, schedule/queue.

Deliverables for the plan:
- New information architecture, not derived from the Instagram-profile shell.
- New primary flow: upload zip/images -> extract/preview -> generate or edit caption -> choose carousel/photos -> show next available slot -> schedule.
- Low-fi wireframe labeled with exact controls and states.
- States checklist: empty, loading, error, success, focus, disabled.
- Migration path: keep current backend endpoints `/api/planner/state`, `/api/planner/prepare`, `/api/planner/schedule`; replace only the static frontend shell.
- Cutover criteria: old profile/stories/tabs UI removed, no `/api/publish` legacy button visible, no static fake metrics, live queue visible, upload and schedule verified against DynamoDB.

Anti-patterns to guard against (specific to REDESIGN):
- Porting old Instagram-profile structure under new styling.
- Keeping both old and new planners visible on the same screen.
- Calling generic slug text "AI-generated caption" unless actual visual captioning is implemented.
- Adding dashboard decoration, fake metrics, story circles, badges, or social-profile cosplay.
- Hiding the scheduling queue behind decorative navigation.
````
