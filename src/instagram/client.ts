import { createHmac } from 'node:crypto';
import { request } from 'node:https';
import { config } from '../config.js';
import type { IgComment, IgMedia, GraphErrorBody } from './types.js';
import type { InstagramInteractiveMessage } from './automationFlow.js';
import type { InstagramOfficialProfile } from './profilePersonalization.js';

/**
 * Cliente fino da Instagram Graph API.
 * Encapsula montagem de URL, appsecret_proof e tratamento de erro,
 * para o resto do app não conhecer os detalhes da Graph API.
 */

function isInstagramLoginToken(): boolean {
  return config.ig.accessToken.startsWith('IG');
}

function graphBase(): string {
  const host = isInstagramLoginToken()
    ? 'https://graph.instagram.com'
    : 'https://graph.facebook.com';
  return `${host}/${config.ig.apiVersion}`;
}

/** Assinatura extra exigida quando o app tem "Require App Secret" ligado. */
function appSecretProof(): string | undefined {
  if (!config.ig.appSecret || isInstagramLoginToken()) return undefined;
  return createHmac('sha256', config.ig.appSecret)
    .update(config.ig.accessToken)
    .digest('hex');
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${graphBase()}/${path}`);
  url.searchParams.set('access_token', config.ig.accessToken);
  const proof = appSecretProof();
  if (proof) url.searchParams.set('appsecret_proof', proof);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function parseError(res: Response): Promise<never> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as GraphErrorBody;
    if (body.error) {
      detail = `${body.error.message} (code ${body.error.code}` +
        `${body.error.error_subcode ? `/${body.error.error_subcode}` : ''}` +
        `${body.error.is_transient !== undefined ? `, transient=${body.error.is_transient}` : ''}` +
        `${body.error.type ? `, type=${body.error.type}` : ''}` +
        `${body.error.error_user_msg ? `, user=${body.error.error_user_msg}` : ''}` +
        `${body.error.fbtrace_id ? `, trace=${body.error.fbtrace_id}` : ''})`;
    }
  } catch {
    // resposta não-JSON; mantém o detalhe genérico
  }
  throw new Error(`Graph API: ${detail}`);
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(buildUrl(path, params));
  if (!res.ok) return parseError(res);
  return (await res.json()) as T;
}

async function post<T>(path: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ ...paramsWithAuth(params) }).toString();
  const url = new URL(`${graphBase()}/${path}`);
  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, {
      method: 'POST',
      family: 4,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode || 500,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end(body);
  });
  if (response.status < 200 || response.status >= 300) {
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(response.body) as GraphErrorBody;
      if (parsed.error) {
        detail = `${parsed.error.message} (code ${parsed.error.code}` +
          `${parsed.error.error_subcode ? `/${parsed.error.error_subcode}` : ''}` +
          `${parsed.error.is_transient !== undefined ? `, transient=${parsed.error.is_transient}` : ''}` +
          `${parsed.error.type ? `, type=${parsed.error.type}` : ''}` +
          `${parsed.error.error_user_msg ? `, user=${parsed.error.error_user_msg}` : ''}` +
          `${parsed.error.fbtrace_id ? `, trace=${parsed.error.fbtrace_id}` : ''})`;
      }
    } catch {
      // resposta vazia ou nao-JSON; preserva status HTTP
    }
    throw new Error(`Graph API: ${detail}`);
  }
  return JSON.parse(response.body) as T;
}

/** POST manda token/proof no corpo, não na query. */
function paramsWithAuth(params: Record<string, string>): Record<string, string> {
  const withAuth: Record<string, string> = {
    ...params,
    access_token: config.ig.accessToken,
  };
  const proof = appSecretProof();
  if (proof) withAuth.appsecret_proof = proof;
  return withAuth;
}

/** Descobre o ig-user-id a partir do token, quando não foi informado no .env. */
export async function resolveUserId(): Promise<string> {
  if (config.ig.userId) return config.ig.userId;

  if (isInstagramLoginToken()) {
    const me = await get<{ id?: string; user_id?: string }>(
      'me',
      { fields: 'id,user_id,username' },
    );
    if (me.id) return me.id;
    if (me.user_id) return me.user_id;
  }

  // Token de página → busca a conta IG vinculada à página
  const me = await get<{ instagram_business_account?: { id: string }; id: string }>(
    'me',
    { fields: 'instagram_business_account' },
  );
  if (me.instagram_business_account?.id) {
    return me.instagram_business_account.id;
  }
  throw new Error(
    'Não foi possível descobrir o IG_USER_ID automaticamente. ' +
      'Preencha IG_USER_ID no .env (ID da conta Instagram Business).',
  );
}

/** Retorna o @username da conta, usado para ignorar os próprios comentários. */
export async function getAccountUsername(userId: string): Promise<string> {
  const data = await get<{ username?: string }>(userId, { fields: 'username' });
  return data.username ?? '';
}

/** Perfil oficial autorizado da pessoa que iniciou a conversa. Não visita nem raspa publicações. */
export async function getInstagramUserProfile(userId: string): Promise<InstagramOfficialProfile> {
  const data = await get<{
    id: string;
    name?: string;
    username?: string;
    is_verified_user?: boolean;
  }>(userId, {
    fields: 'id,name,username,is_verified_user',
  });
  let officialBusiness: {
    biography?: string;
    website?: string;
    username?: string;
  } | undefined;
  if (data.username && /^[a-zA-Z0-9._]{1,30}$/.test(data.username)) {
    try {
      const ownUserId = await resolveUserId();
      const discovery = await get<{ business_discovery?: typeof officialBusiness }>(
        ownUserId,
        {
          fields: `business_discovery.username(${data.username}){biography,website,username}`,
        },
      );
      officialBusiness = discovery.business_discovery;
    } catch (error) {
      console.info('Enriquecimento Business Discovery indisponivel', {
        profileId: userId,
        error: (error as Error).message,
      });
    }
  }
  return {
    id: data.id,
    name: data.name,
    username: data.username,
    biography: officialBusiness?.biography,
    website: officialBusiness?.website,
    accountType: officialBusiness ? 'BUSINESS_OR_CREATOR' : undefined,
    isVerifiedUser: data.is_verified_user,
  };
}

export async function getRecentMedia(userId: string, limit: number): Promise<IgMedia[]> {
  const data = await get<{ data: IgMedia[] }>(`${userId}/media`, {
    fields: 'id,caption,media_type,permalink,timestamp',
    limit: String(limit),
  });
  return data.data ?? [];
}

export async function getMediaById(mediaId: string): Promise<IgMedia> {
  return get<IgMedia>(mediaId, {
    fields: 'id,caption,media_type,permalink,timestamp',
  });
}

export async function getComments(mediaId: string): Promise<IgComment[]> {
  type CommentsPage = {
    data?: IgComment[];
    paging?: { cursors?: { after?: string }; next?: string };
  };

  let path = `${mediaId}/comments`;
  let params: Record<string, string> | undefined = {
    fields: 'id,text,username,timestamp,replies{id,username,text}',
    limit: '100',
  };
  const comments: IgComment[] = [];

  for (let page = 0; page < 10 && path; page++) {
    const data: CommentsPage = await get<CommentsPage>(path, params);
    comments.push(...(data.data ?? []));

    const after: string | undefined = data.paging?.cursors?.after;
    if (!after || !data.paging?.next) break;
    path = `${mediaId}/comments`;
    params = {
      fields: 'id,text,username,timestamp,replies{id,username,text}',
      limit: '100',
      after,
    };
  }

  return comments;
}

/** Posta uma resposta dentro de um comentário. Retorna o id da resposta criada. */
export async function replyToComment(commentId: string, message: string): Promise<string> {
  const data = await post<{ id: string }>(`${commentId}/replies`, { message });
  return data.id;
}

/** Envia uma DM privada vinculada ao comentário. Meta permite uma private reply por comentário. */
export async function sendPrivateReply(commentId: string, message: string): Promise<string> {
  return sendPrivateReplyInteractive(commentId, { kind: 'text', text: message });
}

/** Envia a primeira private reply com texto, quick replies ou card de botoes. */
export async function sendPrivateReplyInteractive(
  commentId: string,
  message: InstagramInteractiveMessage,
): Promise<string> {
  if (!config.ig.pageId) {
    throw new Error('IG_PAGE_ID ausente; private replies precisam do Page ID da conta.');
  }
  const data = await post<{ recipient_id?: string; message_id?: string }>(
    `${config.ig.pageId}/messages`,
    {
      recipient: JSON.stringify({ comment_id: commentId }),
      message: JSON.stringify(serializeInteractiveMessage(message)),
    },
  );
  return data.recipient_id ?? data.message_id ?? '';
}

/** Envia mensagem dentro de uma conversa já aberta pelo usuário. */
export async function sendDirectMessage(recipientId: string, message: string): Promise<string> {
  return sendDirectInteractive(recipientId, { kind: 'text', text: message });
}

/** Continua uma conversa aberta usando quick replies ou botoes com payload. */
export async function sendDirectInteractive(
  recipientId: string,
  message: InstagramInteractiveMessage,
): Promise<string> {
  if (!config.ig.pageId) {
    throw new Error('IG_PAGE_ID ausente; mensagens precisam do Page ID da conta.');
  }
  const data = await post<{ recipient_id?: string; message_id?: string }>(
    `${config.ig.pageId}/messages`,
    {
      recipient: JSON.stringify({ id: recipientId }),
      message: JSON.stringify(serializeInteractiveMessage(message)),
    },
  );
  return data.message_id ?? data.recipient_id ?? '';
}

export function serializeInteractiveMessage(
  message: InstagramInteractiveMessage,
): Record<string, unknown> {
  if (message.kind === 'text') return { text: message.text };
  if (message.kind === 'audio') {
    return {
      attachment: {
        type: 'audio',
        payload: {
          url: message.url,
          is_reusable: false,
        },
      },
    };
  }
  if (message.kind === 'quick_replies') {
    return {
      text: message.text,
      quick_replies: message.quickReplies.map((reply) => ({
        content_type: 'text',
        title: reply.title,
        payload: reply.payload,
      })),
    };
  }
  return {
    attachment: {
      type: 'template',
      payload: {
        template_type: 'generic',
        elements: [{
          title: message.title,
          subtitle: message.subtitle,
          buttons: message.buttons.map((button) => (
            button.type === 'web_url'
              ? { type: 'web_url', title: button.title, url: button.url }
              : { type: 'postback', title: button.title, payload: button.payload }
          )),
        }],
      },
    },
  };
}
