export interface AirtableConfig {
  apiKey: string;
  baseId: string;
  tables: {
    accountInsights: string;
    mediaInsights: string;
    comments: string;
  };
}

export interface AccountInsightRecord {
  date: string; // YYYY-MM-DD
  followersCount?: number;
  impressions?: number;
  reach?: number;
  profileViews?: number;
  websiteClicks?: number;
  accountsEngaged?: number;
}

export interface MediaInsightRecord {
  mediaId: string;
  caption?: string;
  mediaType: string;
  timestamp: string;
  permalink?: string;
  likeCount?: number;
  commentsCount?: number;
  impressions?: number;
  reach?: number;
  saved?: number;
  shares?: number;
  videoViews?: number;
  engagementRate?: number;
}

export interface CommentInsightRecord {
  commentId: string;
  mediaId: string;
  username: string;
  text: string;
  timestamp: string;
  sentiment?: string;
  replied: boolean;
}

export class AirtableSyncClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(private config: AirtableConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = `https://api.airtable.com/v0/${config.baseId}`;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}/${encodeURIComponent(endpoint)}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API Error [${response.status}]: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Salva ou atualiza os Insights da Conta (Métricas Diárias/Totais)
   */
  async upsertAccountInsights(tableName: string, records: AccountInsightRecord[]) {
    if (!records.length) return;
    
    // Formata os registros para a API do Airtable
    const payload = {
      records: records.map((rec) => ({
        fields: {
          Data: rec.date,
          Seguidores: rec.followersCount,
          Impressões: rec.impressions,
          Alcance: rec.reach,
          'Visitas ao Perfil': rec.profileViews,
          'Cliques no Site': rec.websiteClicks,
          'Contas Engajadas': rec.accountsEngaged,
        },
      })),
      typecast: true,
    };

    return this.request(tableName, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Salva ou atualiza os Insights Mídia a Mídia (Posts/Reels/Stories)
   */
  async upsertMediaInsights(tableName: string, records: MediaInsightRecord[]) {
    if (!records.length) return;

    const payload = {
      records: records.map((rec) => ({
        fields: {
          'ID da Mídia': rec.mediaId,
          Legenda: rec.caption?.slice(0, 1000) || '',
          Tipo: rec.mediaType,
          Data: rec.timestamp,
          Link: rec.permalink,
          Curtidas: rec.likeCount,
          Comentários: rec.commentsCount,
          Impressões: rec.impressions,
          Alcance: rec.reach,
          Salvos: rec.saved,
          Compartilhamentos: rec.shares,
          'Visualizações de Vídeo': rec.videoViews,
          'Taxa de Engajamento (%)': rec.engagementRate,
        },
      })),
      typecast: true,
    };

    return this.request(tableName, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Registra um novo comentário ou DM em tempo real
   */
  async logRealtimeInteraction(tableName: string, record: {
    id: string;
    user: string;
    message: string;
    type: 'Comentário' | 'DM';
    sentiment: string;
    date: string;
  }) {
    const payload = {
      records: [{
        fields: {
          ID: record.id,
          Usuário: record.user,
          Mensagem: record.message.slice(0, 1000),
          Tipo: record.type,
          Sentimento: record.sentiment,
          Data: record.date,
        }
      }],
      typecast: true,
    };

    return this.request(tableName, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export async function logInteractionToAirtableAsync(
  text: string,
  user: string,
  id: string,
  type: 'Comentário' | 'DM'
) {
  const airtableApiKey = process.env.AIRTABLE_API_KEY;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID;
  if (!airtableApiKey || !airtableBaseId) return;

  // Analisa o sentimento básico via regra simples, já que a Lambda precisa ser rápida
  let sentiment = 'Outro';
  const txt = text.toLowerCase();
  
  if (/(\b)(quero|comprar|valor|preço|custo|assinatura|link|interesse|chama)(\b)/.test(txt)) {
    sentiment = 'Lead Quente 🔥';
  } else if (/(\b)(como|duvida|dúvida|onde|quando|qual|o que|funciona)(\b)/.test(txt)) {
    sentiment = 'Dúvida ❓';
  } else if (/(\b)(top|show|foda|parabéns|parabens|bom|incrivel|incrível|genial|excelente|amei|legal)(\b)/.test(txt)) {
    sentiment = 'Elogio 👏';
  }

  const client = new AirtableSyncClient({
    apiKey: airtableApiKey,
    baseId: airtableBaseId,
    tables: { accountInsights: '', mediaInsights: '', comments: process.env.AIRTABLE_TABLE_COMMENTS || 'Comentários & DMs' }
  });

  try {
    await client.logRealtimeInteraction(process.env.AIRTABLE_TABLE_COMMENTS || 'Comentários & DMs', {
      id,
      user: user || 'Usuário Desconhecido',
      message: text,
      type,
      sentiment,
      date: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Airtable Sync Error - Realtime]', error);
  }
}

