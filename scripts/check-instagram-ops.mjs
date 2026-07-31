import { execFileSync } from 'node:child_process';

const region = process.env.AWS_REGION || 'us-east-1';
const functionName = process.env.LAMBDA_FUNCTION || 'respondedor-instagram-saraiva-os';
const tableName = process.env.DYNAMODB_TABLE || 'respondedor-instagram-state';
const storeAccount = process.env.STORE_ACCOUNT || 'saraiva-os';
const postRulePrefix = process.env.POST_RULE_PREFIX || 'ig-carousel-saraiva-os-20260617';
const responderRule = process.env.RESPONDER_RULE || 'respondedor-instagram-saraiva-os-schedule';
const logGroup = `/aws/lambda/${functionName}`;
const checkMedia = process.argv.includes('--check-media') || process.env.CHECK_MEDIA === 'true';

function aws(args) {
  return execFileSync('aws', [...args, '--region', region], { encoding: 'utf8' });
}

function jsonAws(args) {
  return JSON.parse(aws([...args, '--output', 'json']));
}

function textAws(args) {
  return aws([...args, '--output', 'text']).trim();
}

function safeJsonAws(args, fallback) {
  try {
    return jsonAws(args);
  } catch (error) {
    return fallback;
  }
}

function safeTextAws(args, fallback = '') {
  try {
    return textAws(args);
  } catch (error) {
    return fallback;
  }
}

const lambda = jsonAws([
  'lambda',
  'get-function-configuration',
  '--function-name',
  functionName,
  '--query',
  '{LastModified:LastModified,Handler:Handler,Runtime:Runtime,Timeout:Timeout,MemorySize:MemorySize,RevisionId:RevisionId,EnvKeys:keys(Environment.Variables)}',
]);

const responder = safeJsonAws([
  'events',
  'describe-rule',
  '--name',
  responderRule,
  '--query',
  '{Name:Name,State:State,ScheduleExpression:ScheduleExpression}',
], null);

const responderTargets = safeJsonAws([
  'events',
  'list-targets-by-rule',
  '--rule',
  responderRule,
  '--query',
  '{TargetCount:length(Targets),TargetIds:Targets[].Id}',
], null);

const postRules = safeJsonAws([
  'events',
  'list-rules',
  '--name-prefix',
  postRulePrefix,
  '--query',
  'Rules[].{Name:Name,State:State,ScheduleExpression:ScheduleExpression}',
], []);

const postTargets = [];
for (const rule of postRules) {
  const targets = safeJsonAws([
    'events',
    'list-targets-by-rule',
    '--rule',
    rule.Name,
    '--query',
    'Targets[].{Id:Id,Input:Input}',
  ], []);
  for (const target of targets) {
    let input = {};
    try {
      input = JSON.parse(target.Input || '{}');
    } catch {
      input = {};
    }
    postTargets.push({
      rule: rule.Name,
      state: rule.State,
      scheduleExpression: rule.ScheduleExpression,
      targetId: target.Id,
      action: input.action,
      slug: input.slug,
      urlCount: Array.isArray(input.urls) ? input.urls.length : 0,
      captionChars: typeof input.caption === 'string' ? input.caption.length : 0,
      inputBytes: Buffer.byteLength(target.Input || '', 'utf8'),
    });
  }
}

const mediaChecks = [];
if (checkMedia) {
  for (const rule of postRules) {
    const targets = safeJsonAws([
      'events',
      'list-targets-by-rule',
      '--rule',
      rule.Name,
      '--query',
      'Targets[].{Id:Id,Input:Input}',
    ], []);
    const target = targets[0];
    if (!target?.Input) continue;
    let input = {};
    try {
      input = JSON.parse(target.Input);
    } catch {
      input = {};
    }
    const urls = Array.isArray(input.urls) ? input.urls : [];
    let ok = 0;
    const failures = [];
    for (const [index, url] of urls.entries()) {
      try {
        const response = await fetch(url, { headers: { range: 'bytes=0-0' } });
        if (response.status === 200 || response.status === 206) {
          ok++;
        } else {
          failures.push({ index: index + 1, status: response.status });
        }
      } catch (error) {
        failures.push({ index: index + 1, error: String(error.message || error) });
      }
    }
    mediaChecks.push({
      rule: rule.Name,
      slug: input.slug,
      ok,
      total: urls.length,
      failures,
    });
  }
}

const publishLocks = safeJsonAws([
  'dynamodb',
  'query',
  '--table-name',
  tableName,
  '--key-condition-expression',
  'pk = :pk',
  '--expression-attribute-values',
  JSON.stringify({ ':pk': { S: `${storeAccount}#webhook` } }),
  '--query',
  'Items[?starts_with(sk.S, `publish#`)].{sk:sk.S,updatedAt:updatedAt.S}',
], []);

const publishedPosts = safeJsonAws([
  'dynamodb',
  'query',
  '--table-name',
  tableName,
  '--key-condition-expression',
  'pk = :pk',
  '--expression-attribute-values',
  JSON.stringify({ ':pk': { S: `${storeAccount}#published` } }),
  '--query',
  'Items[].{slug:sk.S,mediaId:mediaId.S,updatedAt:updatedAt.S}',
], []);

const salesLeads = safeJsonAws([
  'dynamodb',
  'query',
  '--table-name',
  tableName,
  '--key-condition-expression',
  'pk = :pk',
  '--expression-attribute-values',
  JSON.stringify({ ':pk': { S: `${storeAccount}#sales-leads` } }),
  '--query',
  'Items[].{senderId:sk.S,stage:stage.S,score:score.N,temperature:temperature.S,icpFit:icpFit.S,offer:offer.S,nextAction:nextAction.S,updatedAt:updatedAt.S,sync:sync.S}',
], [])
  .map((lead) => ({ ...lead, score: Number(lead.score || 0), sync: parseSync(lead.sync) }))
  .sort((a, b) => b.score - a.score || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  .slice(0, 25);

function parseSync(raw) {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return {
      provider: parsed.provider,
      status: parsed.status,
      syncedAt: parsed.syncedAt,
      error: parsed.error,
    };
  } catch {
    return { status: 'unreadable' };
  }
}

const recentLogLines = safeTextAws([
  'logs',
  'tail',
  logGroup,
  '--since',
  '30m',
  '--format',
  'short',
], '')
  .split('\n')
  .filter((line) => !line.includes('NodeVersionSupportWarning'))
  .filter((line) => (
    line.includes('Ciclo conclu') ||
    line.includes('Carrossel publicado') ||
    line.includes('post-agendado') ||
    line.includes('Falha') ||
    line.includes('ERROR') ||
    line.includes('Graph API')
  ))
  .slice(-20);

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  region,
  lambda,
  responder: responder ? { ...responder, targets: responderTargets } : null,
  scheduledPosts: postTargets,
  mediaChecks,
  publishLocks,
  publishedPosts,
  salesLeads,
  recentSignals: recentLogLines,
}, null, 2));
