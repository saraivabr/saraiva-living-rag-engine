import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const secrets = new SecretsManagerClient({});
let cachedCredentials: ZernioCredentials | undefined;

export interface ZernioCredentials {
  apiKey: string;
  webhookSecret: string;
  communityLinkSecret?: string;
  canarySenderIds?: string[];
}

export async function getZernioCredentials(): Promise<ZernioCredentials> {
  if (process.env.ZERNIO_API_KEY?.trim() && process.env.ZERNIO_WEBHOOK_SECRET?.trim()) {
    return {
      apiKey: process.env.ZERNIO_API_KEY.trim(),
      webhookSecret: process.env.ZERNIO_WEBHOOK_SECRET.trim(),
      ...(process.env.INSTAGRAM_COMMUNITY_LINK_SECRET?.trim()
        ? { communityLinkSecret: process.env.INSTAGRAM_COMMUNITY_LINK_SECRET.trim() }
        : {}),
    };
  }
  if (cachedCredentials) return cachedCredentials;
  const secretId = process.env.ZERNIO_SECRET_ID?.trim();
  if (!secretId) throw new Error('zernio_secret_id_missing');

  const response = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = response.SecretString?.trim();
  if (!raw) throw new Error('zernio_secret_missing');

  let parsed: {
    apiKey?: unknown;
    webhookSecret?: unknown;
    communityLinkSecret?: unknown;
    canarySenderIds?: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error('zernio_secret_invalid');
  }
  if (
    typeof parsed.apiKey !== 'string'
    || !parsed.apiKey.trim()
    || typeof parsed.webhookSecret !== 'string'
    || parsed.webhookSecret.trim().length < 32
  ) {
    throw new Error('zernio_secret_invalid');
  }
  cachedCredentials = {
    apiKey: parsed.apiKey.trim(),
    webhookSecret: parsed.webhookSecret.trim(),
    ...(typeof parsed.communityLinkSecret === 'string'
      && parsed.communityLinkSecret.trim().length >= 32
      ? { communityLinkSecret: parsed.communityLinkSecret.trim() }
      : {}),
    ...(Array.isArray(parsed.canarySenderIds)
      ? {
          canarySenderIds: parsed.canarySenderIds
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean),
        }
      : {}),
  };
  return cachedCredentials;
}
