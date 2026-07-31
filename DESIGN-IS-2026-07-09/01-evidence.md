# Evidence

## Structural Evidence

Sources consulted:

- `/tmp/insta-audit-index.html:11-18`
- `/tmp/insta-audit-index.html:42-44`
- `/tmp/insta-audit-index.html:47-91`
- `/tmp/insta-audit-index.html:94-113`
- `/tmp/insta-audit-index.html:116-160`
- `/tmp/insta-audit-app.js:33-60`
- `/tmp/insta-audit-app.js:147-198`
- `/tmp/insta-audit-app.js:365-388`

Concrete findings:

- Total interactive-element count on audited surface: 38. Breakdown: 28 buttons, 5 inputs, 1 select, 2 textareas, 1 link, 1 dialog.
- Primary task controls are mixed with Instagram-profile chrome: rail buttons at `/tmp/insta-audit-index.html:11-18`, profile actions at `/tmp/insta-audit-index.html:42-44`, upload/scheduling controls at `/tmp/insta-audit-index.html:47-91`, stories/tabs/search at `/tmp/insta-audit-index.html:94-113`.
- Max observed static nesting depth around the dialog/editor path is 7 levels: `body > dialog > div.viewer > aside.editor > div.actions > button` at `/tmp/insta-audit-index.html:116-158`.
- Repeated-pattern count: scheduling appears in two places with different behavior: new factory schedule button at `/tmp/insta-audit-index.html:86-90`, old dialog schedule row at `/tmp/insta-audit-index.html:144-150`.
- Repeated-pattern count: publishing appears in old dialog as `Publicar agora` at `/tmp/insta-audit-index.html:152-157`, while the new factory path schedules only at `/tmp/insta-audit-app.js:180-198`.
- Dead or legacy affordance evidence: `Editar perfil`, `Ver Itens Arquivados`, `Aprovados`, `Agenda`, `Exportar`, `Configuracoes`, `AppleVision`, `Mentoria`, and `Ideias` exist as visible controls but are not part of the upload -> caption -> schedule task (`/tmp/insta-audit-index.html:13-18`, `/tmp/insta-audit-index.html:42-44`, `/tmp/insta-audit-index.html:94-106`).
- Dead or legacy behavior evidence: old planner still fetches `data/posts.json` after the new planner binds events at `/tmp/insta-audit-app.js:365-388`.

Per-principle facts:

- #2 useful: primary task is present, but mixed with at least 20+ controls not required for the upload/schedule path.
- #4 understandable: two scheduling surfaces and an old publish dialog can be interpreted as competing primary flows.
- #5 unobtrusive: Instagram profile/stories/tabs chrome surrounds and competes with the new tool.
- #10 as little design as possible: many controls are removable without breaking the primary task.

Known gaps:

- No component tree from a framework exists; this is static HTML/JS. Nesting depth is inferred from DOM markup.

## Visual Evidence

Sources consulted:

- `/tmp/insta-audit-styles.css:1-13`
- `/tmp/insta-audit-styles.css:32-75`
- `/tmp/insta-audit-styles.css:86-103`
- `/tmp/insta-audit-styles.css:135-140`
- `/tmp/insta-audit-styles.css:576-715`
- `/tmp/insta-audit-styles.css:745-768`

Concrete findings:

- Spacing scale observed: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 31, 34, 36, 38, 40, 42, 44, 46, 48, 56, 58, 60, 62, 70, 74, 80, 92, 160, 168, 180, 190, 220, 222, 260, 320, 360, 420, 560, 760, 820, 900, 920, 999, 1180, 1280px.
- Type scale observed: 10, 11, 12, 13, 15, 22, 24, 26, 28, 30, 31, 38, 40, 62px.
- Distinct hex color count: 30 unique hex values, including `#0095f6`, `#12a150`, `#f06423`, `#d62976`, `#962fbf`, `#feda75`, `#ffe9e9`, and `#fff0e9`.
- Lowest primary-text contrast observed from referenced tokens is acceptable for `#111111` on `#ffffff`, but muted text `#737373` on white is lower emphasis and used for operational status at `/tmp/insta-audit-styles.css:637-641`.
- Visual system conflict: Instagram-style profile ring uses a conic gradient at `/tmp/insta-audit-styles.css:86-92`, while the new factory panel is utilitarian white card UI at `/tmp/insta-audit-styles.css:607-715`.
- The factory itself is a bordered card at `/tmp/insta-audit-styles.css:607-615`, placed under profile actions rather than as the primary app workspace.
- States checklist:
  - Empty: present for upload preview at `/tmp/insta-audit-app.js:110-116` and `/tmp/insta-audit-app.js:368`.
  - Loading: text-only status changes present (`conectando`, `lendo arquivos`, `preparando upload`, `subindo imagens`) at `/tmp/insta-audit-app.js:50-58`, `/tmp/insta-audit-app.js:133-145`, `/tmp/insta-audit-app.js:147-177`.
  - Error: text-only status present at `/tmp/insta-audit-styles.css:648-650` and `/tmp/insta-audit-app.js:57-58`.
  - Success: text-only status present at `/tmp/insta-audit-styles.css:644-646` and `/tmp/insta-audit-app.js:196-197`.
  - Focus: border-color-only focus present at `/tmp/insta-audit-styles.css:603-605`.
  - Disabled: opacity-only disabled state present at `/tmp/insta-audit-styles.css:712-715`.

Per-principle facts:

- #3 aesthetic: type, spacing, and color counts are large for one operational surface; the profile-clone visual language conflicts with the upload tool.
- #5 unobtrusive: decorative profile/stories visual system competes with the task.
- #8 thorough: all state categories have at least a minimal representation, but focus/disabled/loading/error are shallow.

Known gaps:

- No browser screenshot was captured because Playwright was not installed in this repo during the audit. Visual evidence is source-derived.

## Copy & Honesty Evidence

Sources consulted:

- `/tmp/insta-audit-index.html:6-18`
- `/tmp/insta-audit-index.html:28-38`
- `/tmp/insta-audit-index.html:42-44`
- `/tmp/insta-audit-index.html:47-91`
- `/tmp/insta-audit-index.html:94-160`
- `/tmp/insta-audit-app.js:127-131`
- `/tmp/insta-audit-app.js:180-198`
- `/tmp/insta-audit-app.js:249-291`

User-facing strings:

- `Saraiva OS Post Planner` at `/tmp/insta-audit-index.html:6`
- `Grade`, `Aprovados`, `Agenda`, `Exportar`, `Configuracoes` at `/tmp/insta-audit-index.html:13-18`
- `saraiva.os`, `127 posts`, `62,4 mil seguidores`, `1.724 seguindo` at `/tmp/insta-audit-index.html:28-35`
- Profile bio copy at `/tmp/insta-audit-index.html:37`
- `Editar perfil`, `Ver Itens Arquivados` at `/tmp/insta-audit-index.html:42-44`
- `Gerar postagem` and `Envie um .zip ou selecione imagens, revise a legenda e agende na proxima lacuna.` at `/tmp/insta-audit-index.html:50-51`
- `PIN`, `Formato`, `Carrossel`, `Fotos separadas`, `Slug`, `Arquivos`, `Legenda` at `/tmp/insta-audit-index.html:58-82`
- `Atualizar lacunas`, `Preparar upload`, `Agendar na próxima lacuna` at `/tmp/insta-audit-index.html:87-89`
- `AppleVision`, `Mentoria`, `Novo` at `/tmp/insta-audit-index.html:98-100`
- `Posts`, `Carrosséis`, `Ideias`, `Buscar post, tema ou legenda` at `/tmp/insta-audit-index.html:103-109`
- Dialog/editor strings `rascunho`, `Agendar`, `Aprovar post`, `Copiar legenda`, `Publicar agora`, `Apagar post`, `Voltar rascunho` at `/tmp/insta-audit-index.html:136-157`
- `Publicação real deve passar por API segura. Token do Instagram não fica no HTML.` at `/tmp/insta-audit-index.html:160`

Flagged inflations:

- `A legenda sugerida aparece aqui` at `/tmp/insta-audit-index.html:82` implies suggestion generation, but the app only creates a slug-derived generic caption at `/tmp/insta-audit-app.js:127-131`.
- `127 posts`, `62,4 mil seguidores`, `1.724 seguindo` at `/tmp/insta-audit-index.html:32-35` present profile metrics that are decorative/static, not necessary to the planner task.

Flagged dark patterns:

- None found.

Flagged jargon / unclear labels:

- `PIN` at `/tmp/insta-audit-index.html:58-59` is operationally correct but vague; plain replacement: `Senha do planner`.
- `Slug` at `/tmp/insta-audit-index.html:69-70` is developer jargon; plain replacement: `Nome da campanha`.
- `Preparar upload` at `/tmp/insta-audit-index.html:88` hides the real step; plain replacement: `Enviar imagens`.
- `Aprovados`, `Agenda`, `Exportar`, `AppleVision`, `Mentoria`, `Ideias` at `/tmp/insta-audit-index.html:14-16`, `/tmp/insta-audit-index.html:98-106` are unclear in relation to the primary flow.

Label to behavior mismatches:

- `Aprovar post` at `/tmp/insta-audit-index.html:153` sets localStorage status only via `/tmp/insta-audit-app.js:390-403` path, not backend approval.
- `Agendar` in the old dialog at `/tmp/insta-audit-index.html:149` sets localStorage status, while `Agendar na próxima lacuna` at `/tmp/insta-audit-index.html:89` calls backend scheduling through `/tmp/insta-audit-app.js:180-198`.
- `Publicar agora` at `/tmp/insta-audit-index.html:155` calls `/api/publish` through `/tmp/insta-audit-app.js:249-291`, but the new backend uses `/api/planner/*` at `/tmp/insta-audit-app.js:2` and `/tmp/insta-audit-app.js:33-48`.

Per-principle facts:

- #4 understandable: labels expose implementation concepts and old/new flows conflict.
- #6 honest: one visible promise of suggested captions is not backed by visual analysis or real generation.

Known gaps:

- Could not verify whether profile metrics match a real account; they are treated as decorative unless proven live.

## Weight & Friction Evidence

Sources consulted:

- HTTP headers for `https://insta.saraiva.ai/?audit=weight`
- HTTP headers for `https://insta.saraiva.ai/app.js?audit=weight`
- HTTP headers for `https://insta.saraiva.ai/styles.css?audit=weight`
- HTTP headers for `https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js`
- `/tmp/insta-audit-index.html:165-166`
- `/tmp/insta-audit-app.js:386-388`

Concrete findings:

- Initial local JS bytes: `app.js` is 15,261 bytes.
- CSS bytes: `styles.css` is 12,700 bytes.
- HTML bytes: `index.html` is 7,214 bytes.
- External JS dependency: `fflate@0.8.2` is loaded from jsDelivr at `/tmp/insta-audit-index.html:165`; CDN response ETag indicated `W/"7f99..."`, roughly 32KB.
- Minimum initial network request count: at least 7: HTML, CSS, app.js, fflate CDN, `data/posts.json`, favicon, avatar/profile image.
- Runtime JSON dependency: app still fetches `data/posts.json` at `/tmp/insta-audit-app.js:386-388` after the new planner initializes.
- Time-to-interactive: not measured with a browser; estimated low because no bundler and JS is small, but external CDN and JSON dependency add request friction.
- Idle animation count: 0 found in source.
- Notification / badge / modal count on initial load: at least profile badges/dots and status pills exist in markup; modal is not open by default.

Per-principle facts:

- #9 environmentally friendly: JS weight is small, no idle animation, but external dependency and old JSON fetch add unnecessary requests for the primary task.

Known gaps:

- TTI was not measured in-browser because Playwright was unavailable.

## Accessibility Evidence

Sources consulted:

- `/tmp/insta-audit-index.html:11-18`
- `/tmp/insta-audit-index.html:47-91`
- `/tmp/insta-audit-index.html:103-113`
- `/tmp/insta-audit-index.html:116-160`
- `/tmp/insta-audit-styles.css:603-605`
- `/tmp/insta-audit-styles.css:712-715`

Concrete findings:

- ARIA landmark/label count: `aside` has `aria-label="Navegacao"` at `/tmp/insta-audit-index.html:11`; upload section has `aria-label="Gerador de postagens"` at `/tmp/insta-audit-index.html:47`; tabs nav has `aria-label="Abas"` at `/tmp/insta-audit-index.html:103`; grid has `aria-live="polite"` at `/tmp/insta-audit-index.html:113`.
- Skip-link present: no skip link found.
- Keyboard-reachable primary actions are native controls: PIN, format select, slug, file input, caption textarea, refresh, prepare, schedule at `/tmp/insta-audit-index.html:56-90`.
- Focus visibility is only border color change at `/tmp/insta-audit-styles.css:603-605`, with no stronger outline treatment.
- Disabled state for schedule button is opacity-only at `/tmp/insta-audit-styles.css:712-715`.
- The old rail uses symbol-only buttons with `title` attributes at `/tmp/insta-audit-index.html:13-18`; title is weaker than visible text or `aria-label`.

Per-principle facts:

- #2 useful: core controls are keyboard-native.
- #4 understandable: symbol-only rail and old tabs increase ambiguity.
- #8 thorough: accessibility states are present but minimal.

Known gaps:

- Contrast was not computed from rendered browser output; source tokens were inspected.
