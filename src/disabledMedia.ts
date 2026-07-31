import { config } from './config.js';

interface MediaIdentity {
  id?: string;
  shortcode?: string;
  permalink?: string;
}

export function isMediaDisabled(media: MediaIdentity): boolean {
  const id = media.id?.trim();
  const shortcode = media.shortcode?.trim();
  const permalink = media.permalink?.trim();

  if (id && config.behavior.disabledMediaIds.includes(id)) return true;
  if (shortcode && config.behavior.disabledShortcodes.includes(shortcode)) return true;
  if (permalink && config.behavior.disabledPermalinks.some((item) => permalink.includes(item))) return true;

  return false;
}
