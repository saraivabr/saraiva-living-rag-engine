# Verdict

**REDESIGN** — The current `insta.saraiva.ai` surface scores **8/30** and fails load-bearing principles for usefulness, understandability, unobtrusiveness, honesty, durability, and restraint; the right move is to redesign the product surface around the upload -> caption -> schedule workflow instead of refining the Instagram-profile shell.

## Why Redesign

The visible structure is not just ugly; it is wrong for the task. The design frames a production scheduling tool as an Instagram profile clone, mixes legacy local-only controls with real backend scheduling, and leaves the primary workflow buried inside decorative chrome.

## Highest-Leverage Moves

1. **Principle #2 — Useful:** Replace the profile/stories/tabs shell with a single upload pipeline: source -> preview -> caption -> schedule. Evidence: 38 interactive elements and unrelated controls at `/tmp/insta-audit-index.html:11-44`, `/tmp/insta-audit-index.html:47-113`.
2. **Principle #4 — Understandable:** Collapse duplicate scheduling/publishing paths into one backend-backed action model. Evidence: real factory schedule at `/tmp/insta-audit-index.html:86-90`, old localStorage schedule at `/tmp/insta-audit-index.html:144-150`, old `/api/publish` path at `/tmp/insta-audit-app.js:249-291`.
3. **Principle #6 — Honest:** Rename and wire caption generation honestly: either "Rascunho de legenda" from slug or real vision-generated caption. Evidence: promised suggestion at `/tmp/insta-audit-index.html:82`, generic slug caption at `/tmp/insta-audit-app.js:127-131`.
4. **Principle #5 — Unobtrusive:** Make uploaded images and scheduling state the primary visual content; remove Instagram cosplay chrome. Evidence: profile/stories/tabs dominate `/tmp/insta-audit-index.html:21-44` and `/tmp/insta-audit-index.html:94-113`.
5. **Principle #10 — As little design as possible:** Remove every control that does not help upload, review, schedule, or inspect queue. Evidence: rail/profile/actions/stories/tabs/modal legacy actions at `/tmp/insta-audit-index.html:11-18`, `/tmp/insta-audit-index.html:42-44`, `/tmp/insta-audit-index.html:94-113`, `/tmp/insta-audit-index.html:152-157`.

## Preserve

- Backend connection pattern and secure PIN/API separation: `/tmp/insta-audit-app.js:33-48`.
- Upload/prepare/schedule sequence as product capability: `/tmp/insta-audit-app.js:147-198`.
- Core brand restraint: white background, black text, blue accent tokens at `/tmp/insta-audit-styles.css:1-13`.

## Discard

- Instagram profile imitation as the app shell.
- Static profile metrics as proof.
- Story circles and old tab model.
- LocalStorage-only approval/scheduling concepts in the primary UI.
- Symbol-only rail as navigation.
