import { getAccountInsights, getDetailedMediaInsights } from '../instagram/insightsExtractor.js';
import { AirtableSyncClient, logInteractionToAirtableAsync } from './airtableInsights.js';

export { logInteractionToAirtableAsync };

export async function runAirtableInsightsSync() {
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;

  if (!airtableApiKey || !airtableBaseId) {
    console.log('[Airtable Sync] AIRTABLE_API_KEY ou AIRTABLE_BASE_ID não configurados. Pulando sincronização.');
    return;
  }

  const client = new AirtableSyncClient({
    apiKey: airtableApiKey,
    baseId: airtableBaseId,
    tables: {
      accountInsights: process.env.AIRTABLE_TABLE_ACCOUNT || 'Métricas Perfil',
      mediaInsights: process.env.AIRTABLE_TABLE_MEDIA || 'Métricas Publicações',
      comments: process.env.AIRTABLE_TABLE_COMMENTS || 'Comentários',
    },
  });

  console.log('[Airtable Sync] Extraindo métricas da Meta Graph API / Instagram...');

  try {
    // 1. Extrai e envia métricas da conta
    const accountData = await getAccountInsights();
    const today = new Date().toISOString().split('T')[0];

    await client.upsertAccountInsights(process.env.AIRTABLE_TABLE_ACCOUNT || 'Métricas Perfil', [{
      date: today,
      followersCount: accountData.followers_count,
      impressions: accountData.impressions,
      reach: accountData.reach,
      profileViews: accountData.profile_views,
      websiteClicks: accountData.website_clicks,
    }]);

    console.log('[Airtable Sync] Métricas de Perfil enviadas com sucesso!');

    // 2. Extrai e envia métricas das publicações recentes
    const mediaList = await getDetailedMediaInsights(20);
    const mediaRecords = mediaList.map((m) => {
      const totalEngagement = (m.like_count || 0) + (m.comments_count || 0) + (m.saved || 0) + (m.shares || 0);
      const reach = m.reach || 1;
      const engagementRate = Number(((totalEngagement / reach) * 100).toFixed(2));

      return {
        mediaId: m.id,
        caption: m.caption,
        mediaType: m.media_type,
        timestamp: m.timestamp,
        permalink: m.permalink,
        likeCount: m.like_count,
        commentsCount: m.comments_count,
        impressions: m.impressions,
        reach: m.reach,
        saved: m.saved,
        shares: m.shares,
        videoViews: m.video_views,
        engagementRate,
      };
    });

    await client.upsertMediaInsights(process.env.AIRTABLE_TABLE_MEDIA || 'Métricas Publicações', mediaRecords);
    console.log(`[Airtable Sync] Métricas de ${mediaRecords.length} publicações enviadas para o Airtable!`);

  } catch (error) {
    console.error('[Airtable Sync Error]:', error);
  }
}

// Execução direta via CLI se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runAirtableInsightsSync();
}
