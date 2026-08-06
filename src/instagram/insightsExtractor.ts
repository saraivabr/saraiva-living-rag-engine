import { config } from '../config.js';
import { getRecentMedia } from './client.js';

export interface AccountInsightsResponse {
  followers_count?: number;
  media_count?: number;
  impressions?: number;
  reach?: number;
  profile_views?: number;
  website_clicks?: number;
}

export interface MediaInsightsResponse {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
  impressions?: number;
  reach?: number;
  saved?: number;
  shares?: number;
  video_views?: number;
}

function graphBase(): string {
  const isIgToken = config.ig.accessToken.startsWith('IG');
  const host = isIgToken ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
  return `${host}/${config.ig.apiVersion}`;
}

/**
 * Busca insights gerais da conta no Instagram Business/Creator via Meta Graph API
 */
export async function getAccountInsights(): Promise<AccountInsightsResponse> {
  const userId = config.ig.userId;
  if (!userId) {
    throw new Error('IG_USER_ID não configurado no .env');
  }

  // 1. Busca métricas básicas do perfil
  const profileUrl = new URL(`${graphBase()}/${userId}`);
  profileUrl.searchParams.set('fields', 'followers_count,media_count,name,username');
  profileUrl.searchParams.set('access_token', config.ig.accessToken);

  const profileRes = await fetch(profileUrl.toString());
  const profileData = (await profileRes.json()) as any;

  // 2. Busca métricas de insights (impressões, alcance, visitas)
  const insightsUrl = new URL(`${graphBase()}/${userId}/insights`);
  insightsUrl.searchParams.set('metric', 'impressions,reach,profile_views,website_clicks');
  insightsUrl.searchParams.set('period', 'day');
  insightsUrl.searchParams.set('access_token', config.ig.accessToken);

  let insightsData: any = {};
  try {
    const insightsRes = await fetch(insightsUrl.toString());
    if (insightsRes.ok) {
      insightsData = await insightsRes.json();
    }
  } catch {
    // Alguns tokens/contas têm restrições a certas métricas de período
  }

  const metricsMap: Record<string, number> = {};
  if (insightsData.data) {
    for (const item of insightsData.data) {
      const latestValue = item.values?.[item.values.length - 1]?.value ?? 0;
      metricsMap[item.name] = latestValue;
    }
  }

  return {
    followers_count: profileData.followers_count,
    media_count: profileData.media_count,
    impressions: metricsMap.impressions,
    reach: metricsMap.reach,
    profile_views: metricsMap.profile_views,
    website_clicks: metricsMap.website_clicks,
  };
}

/**
 * Extrai métricas detalhadas (impressões, alcance, salvamentos, compartilhamentos) de cada post do Instagram
 */
export async function getDetailedMediaInsights(limit = 25): Promise<MediaInsightsResponse[]> {
  const userId = config.ig.userId;
  if (!userId) {
    throw new Error('IG_USER_ID não configurado no .env');
  }

  const mediaList = await getRecentMedia(userId, limit);
  const detailedMedia: MediaInsightsResponse[] = [];

  for (const media of mediaList) {
    const mediaId = media.id;
    
    // Métricas suportadas variam conforme o tipo de mídia (IMAGE, VIDEO, CAROUSEL_ALBUM, REELS)
    let metricsToFetch = 'impressions,reach,saved';
    if (media.media_type === 'VIDEO' || media.media_type === 'REELS') {
      metricsToFetch = 'impressions,reach,saved,shares,video_views';
    }

    const insightsUrl = new URL(`${graphBase()}/${mediaId}/insights`);
    insightsUrl.searchParams.set('metric', metricsToFetch);
    insightsUrl.searchParams.set('access_token', config.ig.accessToken);

    let metricsMap: Record<string, number> = {};
    try {
      const res = await fetch(insightsUrl.toString());
      if (res.ok) {
        const body = (await res.json()) as any;
        if (body.data) {
          for (const item of body.data) {
            metricsMap[item.name] = item.values?.[0]?.value ?? item.value ?? 0;
          }
        }
      }
    } catch {
      // Ignora erro se a mídia for muito antiga ou sem suporte a certas métricas
    }

    detailedMedia.push({
      id: media.id,
      caption: media.caption,
      media_type: media.media_type || 'IMAGE',
      timestamp: media.timestamp || new Date().toISOString(),
      permalink: media.permalink,
      like_count: media.like_count,
      comments_count: media.comments_count,
      impressions: metricsMap.impressions,
      reach: metricsMap.reach,
      saved: metricsMap.saved,
      shares: metricsMap.shares,
      video_views: metricsMap.video_views,
    });
  }

  return detailedMedia;
}
