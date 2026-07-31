function normalizeForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const WEBSITE_PROMPT_MEDIA_ID = '18130447453725127';
export const WEBSITE_PROMPT_SHORTCODE = 'DbUd5FKRVxf';
export const PROSPECTING_FLOW_MEDIA_ID = '18299164084305199';
export const PROSPECTING_FLOW_SHORTCODE = 'DbZhCk6OQ0s';

const mediaTriggerWords: Readonly<Record<string, readonly string[]>> = Object.freeze({
  [WEBSITE_PROMPT_MEDIA_ID]: ['saraiva'],
  [PROSPECTING_FLOW_MEDIA_ID]: ['saraiva'],
});

function configuredMusicCampaignMediaIds(): readonly string[] {
  return (process.env.MUSIC_CAMPAIGN_MEDIA_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isMusicCampaignMedia(mediaId: string): boolean {
  return configuredMusicCampaignMediaIds().includes(mediaId);
}

function triggerWordsForMedia(
  mediaId: string,
  fallbackTriggerWords: readonly string[],
): readonly string[] {
  if (isMusicCampaignMedia(mediaId)) {
    return ['musica', 'música', 'jingle'];
  }
  // Mídias autorizadas para automação (Reels práticos)
  if (mediaId in mediaTriggerWords) {
    return mediaTriggerWords[mediaId];
  }
  // Desativa automação para carrosséis estáticos e postagens de feed que não engajaram
  return [];
}

/**
 * Matches configured campaign terms as complete words or phrases.
 * This prevents substrings such as "Paula" -> "aula" and
 * "desligar" -> "ligar" from opening an automated sales flow.
 */
export function matchesCampaignTrigger(text: string, triggerWords: readonly string[]): boolean {
  const normalizedText = normalizeForMatch(text);
  if (!normalizedText) return false;

  return triggerWords.some((triggerWord) => {
    const normalizedTrigger = normalizeForMatch(triggerWord);
    if (!normalizedTrigger) return false;

    const phrase = normalizedTrigger
      .split(/\s+/)
      .map(escapeRegExp)
      .join('\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${phrase}(?=$|[^a-z0-9])`).test(normalizedText);
  });
}

/**
 * A palavra-chave de uma campanha pertence ao post, não à conta inteira.
 * Assim, "SARAIVA" abre o funil de sites somente no reel que prometeu o
 * material, sem transformar qualquer menção ao nome em autorização comercial.
 */
export function matchesMediaCampaignTrigger(
  mediaId: string,
  text: string,
  fallbackTriggerWords: readonly string[],
): boolean {
  return matchesCampaignTrigger(
    text,
    triggerWordsForMedia(mediaId, fallbackTriggerWords),
  );
}
