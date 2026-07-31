import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getApifyToken } from '../dist/automation/apifyToken.js';
import {
  isGoogleMapsUrl,
  lookupBusinessWithApify,
} from '../dist/automation/sitePromptAutomation.js';
import {
  buildGoogleProspectDossier,
  buildInstagramProspectDossier,
  isInstagramProfileUrl,
  lookupInstagramProfileWithApify,
} from '../dist/automation/prospectAnalysis.js';

const port = Number(process.env.PROSPECCAO_PORT || 4173);
const host = '127.0.0.1';
const root = resolve(fileURLToPath(new URL('../site/prospeccao/', import.meta.url)));
const cache = new Map();
const inFlight = new Map();
const cacheTtlMs = 10 * 60 * 1000;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
    if (request.method === 'POST' && requestUrl.pathname === '/api/prospeccao/analyze') {
      await handleAnalysis(request, response);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }
    await serveStatic(requestUrl.pathname, request.method === 'HEAD', response);
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'prospect_request_failed',
      error: error instanceof Error ? error.message : 'unknown_error',
    }));
    sendJson(response, 500, { ok: false, error: 'internal_error' });
  }
});

server.listen(port, host, () => {
  console.log(`Cliente Pronto real: http://${host}:${port}/`);
});

async function handleAnalysis(request, response) {
  const body = await readJsonBody(request);
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  if (!isGoogleMapsUrl(link) && !isInstagramProfileUrl(link)) {
    sendJson(response, 400, { ok: false, error: 'unsupported_company_link' });
    return;
  }

  const cached = cache.get(link);
  if (cached && Date.now() - cached.createdAt < cacheTtlMs) {
    sendJson(response, 200, { ok: true, cached: true, dossier: cached.dossier });
    return;
  }

  let promise = inFlight.get(link);
  if (!promise) {
    promise = analyzeLink(link);
    inFlight.set(link, promise);
  }

  try {
    const dossier = await promise;
    cache.set(link, { createdAt: Date.now(), dossier });
    sendJson(response, 200, { ok: true, cached: false, dossier });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'analysis_failed';
    const notFound = [
      'instagram_profile_not_found',
      'apify_business_not_found',
      'apify_business_invalid',
    ].includes(code);
    console.error(JSON.stringify({
      level: 'error',
      message: 'prospect_analysis_failed',
      source: isInstagramProfileUrl(link) ? 'instagram' : 'google_maps',
      error: code,
    }));
    sendJson(response, notFound ? 404 : 502, {
      ok: false,
      error: notFound ? 'company_not_found' : 'analysis_provider_failed',
    });
  } finally {
    inFlight.delete(link);
  }
}

async function analyzeLink(link) {
  const token = await getApifyToken();
  if (isInstagramProfileUrl(link)) {
    const profile = await lookupInstagramProfileWithApify({
      token,
      profileUrl: link,
    });
    return buildInstagramProspectDossier(profile);
  }
  const { place } = await lookupBusinessWithApify({
    token,
    business: link,
  });
  return buildGoogleProspectDossier(place);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12_000) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new Error('invalid_json');
  }
}

async function serveStatic(pathname, headOnly, response) {
  const appPath = pathname === '/prospeccao'
    || pathname === '/prospeccao/'
    ? '/'
    : pathname.replace(/^\/prospeccao\//, '/');
  const relative = appPath === '/' ? 'index.html' : appPath.replace(/^\/+/, '');
  const filePath = resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    sendJson(response, 403, { ok: false, error: 'forbidden' });
    return;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    response.end(headOnly ? undefined : data);
  } catch {
    sendJson(response, 404, { ok: false, error: 'not_found' });
  }
}

function sendJson(response, status, body) {
  if (response.headersSent) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
