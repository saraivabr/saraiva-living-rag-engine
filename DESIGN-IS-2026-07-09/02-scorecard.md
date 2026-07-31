# Scorecard

1. **Good design is innovative** — Score: 1/3  
   Evidence: The surface imitates an Instagram profile shell with rail, profile metrics, stories, and tabs (`01-evidence.md#structural-evidence`, `/tmp/insta-audit-index.html:11-44`, `/tmp/insta-audit-index.html:94-113`).  
   Justification: It has a useful backend idea, but the visible form copies an existing social profile pattern with only minor variation.

2. **Good design makes a product useful** — Score: 1/3  
   Evidence: The primary upload/schedule task exists (`/tmp/insta-audit-index.html:47-91`), but the first surface has 38 interactive elements and many unrelated controls (`01-evidence.md#structural-evidence`).  
   Justification: The task is possible, but unnecessary detours and old planner controls dilute the path.

3. **Good design is aesthetic** — Score: 1/3  
   Evidence: The CSS references 30 distinct hex colors, a very large px scale, and two conflicting visual systems: Instagram profile clone and utilitarian upload panel (`01-evidence.md#visual-evidence`).  
   Justification: There is some styling, but the surface has multiple jarring violations rather than one coherent product system.

4. **Good design makes a product understandable** — Score: 1/3  
   Evidence: Two different scheduling surfaces exist (`/tmp/insta-audit-index.html:86-90`, `/tmp/insta-audit-index.html:144-150`), and labels like `Slug`, `PIN`, `Preparar upload`, `Aprovados`, `AppleVision`, and `Mentoria` are unclear (`01-evidence.md#copy--honesty-evidence`).  
   Justification: A first-time user cannot reliably identify which controls are real, legacy, local-only, or backend-backed.

5. **Good design is unobtrusive** — Score: 0/3  
   Evidence: Instagram-like profile, stats, stories, tabs, and rail surround the upload system (`/tmp/insta-audit-index.html:11-44`, `/tmp/insta-audit-index.html:94-113`), while the real factory starts only at `/tmp/insta-audit-index.html:47-91`.  
   Justification: The chrome dominates the content; the work surface is not the figure.

6. **Good design is honest** — Score: 1/3  
   Evidence: `A legenda sugerida aparece aqui` promises a suggestion (`/tmp/insta-audit-index.html:82`), but the implementation returns a generic slug-derived caption (`/tmp/insta-audit-app.js:127-131`); profile metrics appear static/decorative (`/tmp/insta-audit-index.html:32-35`).  
   Justification: There is no dark pattern, but visible claims and labels do not map 1:1 to actual behavior.

7. **Good design is long-lasting** — Score: 0/3  
   Evidence: The Instagram profile clone, story circles, symbolic rail buttons, and mixed dashboard/card treatment anchor the product to a borrowed social UI trend (`01-evidence.md#structural-evidence`, `01-evidence.md#visual-evidence`).  
   Justification: The design reads as a specific borrowed pattern rather than a durable operational tool.

8. **Good design is thorough down to the last detail** — Score: 1/3  
   Evidence: Empty/loading/error/success/focus/disabled states exist, but focus is only border color, disabled is opacity-only, and loading/error are text status only (`01-evidence.md#visual-evidence`, `/tmp/insta-audit-styles.css:603-605`, `/tmp/insta-audit-styles.css:712-715`).  
   Justification: State coverage is present but rough; details are not yet considered enough for a production tool.

9. **Good design is environmentally friendly** — Score: 2/3  
   Evidence: Local JS is 15,261 bytes, CSS is 12,700 bytes, no idle animation was found, but fflate CDN and legacy `data/posts.json` add requests (`01-evidence.md#weight--friction-evidence`, `/tmp/insta-audit-index.html:165-166`, `/tmp/insta-audit-app.js:386-388`).  
   Justification: The surface is lightweight enough, but it still carries avoidable network and cognitive load.

10. **Good design is as little design as possible** — Score: 0/3  
    Evidence: Removing profile metrics, edit/archive buttons, story filters, old tabs, old modal actions, and symbol rail would not break upload -> caption -> schedule (`01-evidence.md#structural-evidence`).  
    Justification: The page is dominated by removable decoration and duplicated affordances.

## Total

8 / 30
