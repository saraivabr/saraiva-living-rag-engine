import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const APIFY_SECRET_ID = 'dna-digital/production/apify';
const secrets = new SecretsManagerClient({});

let cachedToken: string | undefined;

export async function getApifyToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const response = await secrets.send(new GetSecretValueCommand({
    SecretId: APIFY_SECRET_ID,
  }));
  const secret = response.SecretString?.trim();
  if (!secret) throw new Error('apify_token_missing');

  try {
    const parsed = JSON.parse(secret) as { token?: unknown };
    if (typeof parsed.token === 'string' && parsed.token.trim()) {
      cachedToken = parsed.token.trim();
      return cachedToken;
    }
  } catch {
    if (!secret.startsWith('{')) {
      cachedToken = secret;
      return cachedToken;
    }
  }

  throw new Error('apify_token_missing');
}
