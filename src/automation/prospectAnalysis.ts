import {
  buildClientReadyKit,
  businessPromptData,
  type ApifyPlace,
} from './sitePromptAutomation.js';

const INSTAGRAM_PROFILE_ACTOR = 'apify~instagram-profile-scraper';

export interface InstagramProfile {
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  isBusinessAccount?: boolean;
  businessCategoryName?: string;
  verified?: boolean;
  private?: boolean;
  externalUrl?: string;
  businessAddress?: string | {
    streetAddress?: string;
    cityName?: string;
    regionName?: string;
    zipCode?: string;
  };
  about?: {
    country?: string;
  };
  latestPosts?: Array<{
    likesCount?: number;
    commentsCount?: number;
    timestamp?: string;
  }>;
  error?: string;
}

export interface ProspectSignal {
  label: string;
  value: string;
  suffix: string;
  tone?: 'default' | 'positive' | 'rating';
}

export interface ProspectDossier {
  source: 'instagram' | 'google_maps';
  sourceLabel: string;
  fetchedAt: string;
  name: string;
  initials: string;
  category: string;
  location: string;
  score: number;
  signals: [ProspectSignal, ProspectSignal, ProspectSignal];
  diagnosis: string;
  diagnosisText: string;
  opportunity: string;
  opportunityText: string;
  approachMessage: string;
  followupOne: string;
  followupTwo: string;
  offerName: string;
  offerPromise: string;
  offerScope: string[];
  price: string;
  installment: string;
  monthly: string;
}

export function isInstagramProfileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || host !== 'instagram.com') return false;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
    const username = parts[0];
    if (['p', 'reel', 'reels', 'stories', 'explore', 'accounts'].includes(username.toLowerCase())) {
      return false;
    }
    return /^[a-zA-Z0-9._]{1,30}$/.test(username);
  } catch {
    return false;
  }
}

export function instagramUsername(value: string): string {
  if (!isInstagramProfileUrl(value)) throw new Error('instagram_profile_url_invalid');
  return new URL(value).pathname.split('/').filter(Boolean)[0];
}

export async function lookupInstagramProfileWithApify(input: {
  token: string;
  profileUrl: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<InstagramProfile> {
  const token = input.token.trim();
  if (!token) throw new Error('apify_token_missing');
  const username = instagramUsername(input.profileUrl);
  const baseUrl = (input.baseUrl || 'https://api.apify.com').replace(/\/+$/, '');
  const url = new URL(
    `${baseUrl}/v2/acts/${INSTAGRAM_PROFILE_ACTOR}/run-sync-get-dataset-items`,
  );
  url.searchParams.set('format', 'json');
  url.searchParams.set('clean', 'true');
  url.searchParams.set('limit', '1');
  url.searchParams.set('timeout', '120');

  const response = await (input.fetchImpl || fetch)(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      usernames: [username],
      includeAboutSection: false,
    }),
    signal: AbortSignal.timeout(150_000),
  });
  const body = await response.json().catch(() => []) as unknown;
  if (!response.ok) throw new Error(`apify_instagram_lookup_failed_${response.status}`);
  if (!Array.isArray(body) || !body[0] || typeof body[0] !== 'object') {
    throw new Error('instagram_profile_not_found');
  }
  const profile = body[0] as InstagramProfile;
  if (profile.error || !cleanText(profile.username || profile.fullName, 160)) {
    throw new Error('instagram_profile_not_found');
  }
  return profile;
}

export function buildInstagramProspectDossier(
  profile: InstagramProfile,
  now = new Date(),
): ProspectDossier {
  const username = cleanText(profile.username, 80) || 'empresa';
  const name = cleanText(profile.fullName, 160) || titleCase(username.replace(/[._]+/g, ' '));
  const category = cleanText(profile.businessCategoryName, 120)
    || inferInstagramCategory(profile.biography)
    || 'Negócio no Instagram';
  const followers = validCount(profile.followersCount);
  const following = validCount(profile.followsCount);
  const posts = validCount(profile.postsCount);
  const location = instagramLocation(profile);
  const website = safePublicUrl(profile.externalUrl);
  const recentPosts = Array.isArray(profile.latestPosts) ? profile.latestPosts : [];
  const score = instagramOpportunityScore({
    followers,
    posts,
    hasBio: Boolean(cleanText(profile.biography, 600)),
    hasWebsite: Boolean(website),
    business: profile.isBusinessAccount === true,
    verified: profile.verified === true,
    recentPosts: recentPosts.length,
  });
  const price = recommendedPrice(followers);
  const audienceProof = followers !== undefined
    ? `${formatCompactNumber(followers)} seguidores públicos`
    : 'audiência pública disponível no perfil';
  const contentProof = posts !== undefined
    ? `${formatCompactNumber(posts)} publicações`
    : 'histórico de conteúdo público';
  const externalPath = website
    ? 'já existe um link externo, mas ele pode ser organizado em uma jornada mais direta de conversão'
    : 'não há um próximo passo externo claro, o que aumenta a perda entre a visita e a conversa';
  const firstName = name.split(/\s+/)[0];

  return {
    source: 'instagram',
    sourceLabel: `Instagram @${username}`,
    fetchedAt: now.toISOString(),
    name,
    initials: initials(name),
    category,
    location,
    score,
    signals: [
      {
        label: 'SEGUIDORES',
        value: followers === undefined ? '—' : formatCompactNumber(followers),
        suffix: 'públicos',
      },
      {
        label: 'PUBLICAÇÕES',
        value: posts === undefined ? '—' : formatCompactNumber(posts),
        suffix: recentPosts.length ? `${recentPosts.length} recentes lidas` : 'no perfil',
      },
      {
        label: 'CONTA',
        value: profile.isBusinessAccount ? 'Comercial' : profile.private ? 'Privada' : 'Pública',
        suffix: profile.verified ? 'verificada' : following !== undefined ? `${formatCompactNumber(following)} seguindo` : '',
        tone: 'positive',
      },
    ],
    diagnosis: website
      ? 'O perfil gera atenção, mas a jornada comercial ainda pode ser mais direta.'
      : 'O perfil concentra atenção, mas não conduz o visitante para uma próxima ação clara.',
    diagnosisText:
      `A análise encontrou ${audienceProof}, ${contentProof} e posicionamento em ${category}. ` +
      `Hoje, ${externalPath}.`,
    opportunity: 'Transformar atenção do perfil em conversas qualificadas.',
    opportunityText:
      `Criar uma página comercial para ${name}, conectando a promessa da bio, provas reais, ` +
      'oferta e WhatsApp em um único caminho mensurável.',
    approachMessage:
      `Oi! Analisei o perfil de ${name} e vi que vocês já construíram ${audienceProof}. ` +
      `Percebi uma oportunidade de transformar mais visitas em conversas comerciais, organizando ` +
      'a oferta e o caminho até o WhatsApp. Preparei uma direção específica a partir desses dados. Posso te mostrar?',
    followupOne:
      `Posso te enviar a ideia visual que montei para o perfil de ${name}? Você avalia em 2 minutos.`,
    followupTwo:
      'Deixo a análise reservada por aqui. Se fizer sentido, te mostro sem compromisso.',
    offerName: `Funil de Conversão para ${firstName}`,
    offerPromise:
      `Transformar a presença que a ${name} já construiu no Instagram em um caminho claro para pedidos e orçamentos.`,
    offerScope: [
      'página responsiva focada em conversão',
      'oferta, diferenciais e provas do perfil',
      'integração com WhatsApp e Instagram',
      'mensuração, publicação e uma rodada de ajustes',
    ],
    ...price,
  };
}

export function buildGoogleProspectDossier(
  place: ApifyPlace,
  now = new Date(),
): ProspectDossier {
  const data = businessPromptData(place);
  const kit = buildClientReadyKit(data);
  const name = data.name;
  const category = data.category || 'Negócio local';
  const location = [data.city, data.state].filter(Boolean).join(', ')
    || data.address
    || 'Localização pública';
  const rating = data.rating;
  const reviews = data.reviewsCount;
  const score = googleOpportunityScore({
    rating,
    reviews,
    hasPhone: Boolean(data.phone),
    hasWebsite: Boolean(data.website),
  });
  const price = recommendedPrice(reviews);
  const firstName = name.split(/\s+/)[0];

  return {
    source: 'google_maps',
    sourceLabel: 'Google Maps',
    fetchedAt: now.toISOString(),
    name,
    initials: initials(name),
    category,
    location,
    score,
    signals: [
      {
        label: 'AVALIAÇÃO',
        value: rating === undefined ? '—' : rating.toFixed(1),
        suffix: rating === undefined ? 'não informada' : '★',
        tone: 'rating',
      },
      {
        label: 'PROVAS PÚBLICAS',
        value: reviews === undefined ? '—' : formatCompactNumber(reviews),
        suffix: 'avaliações',
      },
      {
        label: 'CONTATO',
        value: data.phone ? 'Disponível' : 'A confirmar',
        suffix: data.website ? 'site encontrado' : 'sem site identificado',
        tone: data.phone ? 'positive' : 'default',
      },
    ],
    diagnosis: data.website
      ? 'Boa reputação local, com oportunidade de tornar a conversão mais direta.'
      : 'A empresa tem sinais públicos de confiança, mas ainda não apresenta um caminho digital próprio.',
    diagnosisText: kit.diagnosis.publicSignal,
    opportunity: 'Transformar buscas locais em conversas qualificadas.',
    opportunityText: kit.diagnosis.opportunity,
    approachMessage: kit.whatsappApproaches[0].text,
    followupOne: kit.whatsappApproaches[1].text,
    followupTwo: kit.whatsappApproaches[2].text,
    offerName: `Página de Conversão Local para ${firstName}`,
    offerPromise: kit.offer.promise,
    offerScope: kit.offer.suggestedScope.slice(0, 4),
    ...price,
  };
}

function googleOpportunityScore(input: {
  rating?: number;
  reviews?: number;
  hasPhone: boolean;
  hasWebsite: boolean;
}): number {
  let score = 58;
  if (input.rating !== undefined && input.rating >= 4.5) score += 10;
  if (input.reviews !== undefined && input.reviews >= 25) score += 7;
  if (input.reviews !== undefined && input.reviews >= 100) score += 6;
  if (input.hasPhone) score += 6;
  if (!input.hasWebsite) score += 7;
  return Math.min(95, score);
}

function instagramOpportunityScore(input: {
  followers?: number;
  posts?: number;
  hasBio: boolean;
  hasWebsite: boolean;
  business: boolean;
  verified: boolean;
  recentPosts: number;
}): number {
  let score = 54;
  if (input.followers !== undefined && input.followers >= 1_000) score += 7;
  if (input.followers !== undefined && input.followers >= 10_000) score += 5;
  if (input.posts !== undefined && input.posts >= 25) score += 6;
  if (input.hasBio) score += 5;
  if (input.business) score += 5;
  if (input.verified) score += 4;
  if (input.recentPosts > 0) score += 5;
  if (!input.hasWebsite) score += 5;
  return Math.min(95, score);
}

function recommendedPrice(scale?: number): {
  price: string;
  installment: string;
  monthly: string;
} {
  if (scale !== undefined && scale >= 100_000) {
    return { price: '2.497', installment: 'R$ 899', monthly: 'R$ 497/mês' };
  }
  if (scale !== undefined && scale >= 10_000) {
    return { price: '1.997', installment: 'R$ 699', monthly: 'R$ 397/mês' };
  }
  return { price: '1.497', installment: 'R$ 549', monthly: 'R$ 297/mês' };
}

function instagramLocation(profile: InstagramProfile): string {
  if (typeof profile.businessAddress === 'string') {
    return cleanText(profile.businessAddress, 200) || 'Instagram público';
  }
  if (profile.businessAddress && typeof profile.businessAddress === 'object') {
    const address = [
      profile.businessAddress.cityName,
      profile.businessAddress.regionName,
      profile.businessAddress.streetAddress,
    ].map((part) => cleanText(part, 100)).filter(Boolean).join(', ');
    if (address) return address;
  }
  return cleanText(profile.about?.country, 100) || 'Instagram público';
}

function inferInstagramCategory(bio?: string): string | undefined {
  const value = cleanText(bio, 600)?.toLowerCase();
  if (!value) return undefined;
  if (/(beleza|makeup|maquiagem|sal[aã]o|est[eé]tica)/.test(value)) return 'Beleza e estética';
  if (/(restaurante|caf[eé]|comida|gastronomia)/.test(value)) return 'Alimentação e gastronomia';
  if (/(imobili[aá]ria|im[oó]vel|corretor)/.test(value)) return 'Imóveis';
  if (/(academia|fitness|personal|treino)/.test(value)) return 'Saúde e fitness';
  if (/(ag[eê]ncia|marketing|tecnologia|software|ia)/.test(value)) return 'Tecnologia e serviços';
  return undefined;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'EA';
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function validCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return clean || undefined;
}

function safePublicUrl(value: unknown): string | undefined {
  const clean = cleanText(value, 500);
  if (!clean) return undefined;
  try {
    const url = new URL(clean);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
