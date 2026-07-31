# Scope

## Audited Surface

- Live URL: `https://insta.saraiva.ai`
- Captured files:
  - `/tmp/insta-audit-index.html`
  - `/tmp/insta-audit-app.js`
  - `/tmp/insta-audit-styles.css`
- Audit date: 2026-07-09
- Current product intent: turn `insta.saraiva.ai` into the Instagram post generation and scheduling system.

## Primary User

Felipe Saraiva operating his own Instagram publishing workflow.

## Primary Task

Upload a `.zip` or a group of images, get or revise a caption, choose carousel vs separate photos, find the next posting gap, and schedule safely without exposing Instagram/AWS tokens.

## Constraints

- Must use the existing AWS CLI / Cloudflare infrastructure.
- Publishing and scheduling must go through secure backend APIs; Instagram token must not be in frontend HTML.
- Existing backend: Lambda `respondedor-instagram-saraiva-os`, DynamoDB queue `saraiva-os#scheduled`, S3 assets, EventBridge scheduler.
- Existing frontend is static S3 site behind Cloudflare on `insta.saraiva.ai`.

## References

- Current UI intentionally resembles an Instagram profile/planner surface.
- No external competitor references were supplied.

## Audit Boundary

This audit covers the first loaded surface and upload/scheduling controls visible in `index.html`, `app.js`, and `styles.css`. It does not audit backend correctness except where backend behavior affects the user-facing design.
