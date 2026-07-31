import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const region = process.env.AWS_REGION || 'us-east-1';
const tableName = process.env.DYNAMODB_TABLE || 'respondedor-instagram-state';
const storeAccount = process.env.STORE_ACCOUNT || 'saraiva-os';
const bucket = process.env.S3_BUCKET || 'app-dino-coworking-clinic-880690593918';
const prefixBase = process.env.S3_PREFIX_BASE || 'instagram/saraiva-os';
const publicBase = process.env.PUBLIC_BASE || `https://${bucket}.s3.amazonaws.com`;
const timeZone = 'America/Sao_Paulo';
const defaultSlotTimes = ['09:00', '12:00', '15:00', '18:00'];
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.input) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const mode = args.mode || 'carousel';
if (!['carousel', 'photos'].includes(mode)) {
  throw new Error('--mode precisa ser "carousel" ou "photos".');
}

const inputPath = resolve(args.input);
const slug = args.slug || slugify(basename(inputPath, extname(inputPath)));
const dryRun = Boolean(args['dry-run']);
const limit = Number(args.limit || (mode === 'carousel' ? 10 : Number.POSITIVE_INFINITY));
const slotTimes = String(args.slots || defaultSlotTimes.join(','))
  .split(',')
  .map((slot) => slot.trim())
  .filter(Boolean);

if (!slug) throw new Error('Nao foi possivel definir slug. Passe --slug.');
if (!existsSync(inputPath)) throw new Error(`Input nao encontrado: ${inputPath}`);

const sourceDir = await resolveInputDir(inputPath);
const sourceImages = (await listImages(sourceDir)).slice(0, limit);
if (!sourceImages.length) throw new Error(`Nenhuma imagem encontrada em ${sourceDir}`);
if (mode === 'carousel' && sourceImages.length > 10) {
  throw new Error('Carrossel aceita no maximo 10 imagens. Use --limit 10 ou --mode photos.');
}
if (mode === 'carousel' && sourceImages.length < 2) {
  throw new Error('Carrossel precisa de pelo menos 2 imagens.');
}

const captions = await loadCaptions(args, mode, sourceImages.length);
const existingDueAts = await loadScheduledDueAts();
const jobCount = mode === 'photos' ? sourceImages.length : 1;
const slots = nextFreeSlots(jobCount, {
  slotTimes,
  existingDueAts,
  startAfter: args['start-after'] ? new Date(args['start-after']) : new Date(),
});

const normalizedDir = join(tmpdir(), `ig-schedule-${Date.now()}-${slug}`);
mkdirSync(normalizedDir, { recursive: true });

const uploaded = [];
for (const [index, imagePath] of sourceImages.entries()) {
  const ordinal = String(index + 1).padStart(2, '0');
  const normalizedPath = join(normalizedDir, `${mode === 'photos' ? 'foto' : 'slide'}-${ordinal}.jpg`);
  normalizeImage(imagePath, normalizedPath);

  const objectName = mode === 'photos' ? `foto-${ordinal}.jpg` : `slide-${ordinal}.jpg`;
  const key = `${prefixBase}/${slug}/${objectName}`;
  const url = `${publicBase}/${key}`;

  if (!dryRun) {
    aws(['s3', 'cp', normalizedPath, `s3://${bucket}/${key}`, '--content-type', 'image/jpeg', '--only-show-errors']);
    const status = await headByte(url);
    if (status !== 200 && status !== 206) {
      throw new Error(`Asset nao ficou publico: HTTP ${status} ${url}`);
    }
  }

  uploaded.push({ index: index + 1, source: imagePath, key, url });
}

const jobs = mode === 'photos'
  ? uploaded.map((image, index) => ({
    folder: args.folder || '',
    slug: `${slug}-foto-${String(index + 1).padStart(2, '0')}`,
    dueAt: slots[index].dueAt,
    localTime: slots[index].localTime,
    payload: {
      action: 'publishImage',
      slug: `${slug}-foto-${String(index + 1).padStart(2, '0')}`,
      imageUrl: image.url,
      caption: captions[index],
    },
  }))
  : [{
    folder: args.folder || '',
    slug,
    dueAt: slots[0].dueAt,
    localTime: slots[0].localTime,
    payload: {
      action: 'publishCarousel',
      slug,
      urls: uploaded.map((image) => image.url),
      caption: captions[0],
    },
  }];

for (const job of jobs) {
  const item = {
    pk: { S: `${storeAccount}#scheduled` },
    sk: { S: `due#${job.dueAt}~${job.slug}` },
    dueAt: { S: job.dueAt },
    slug: { S: job.slug },
    payload: { S: JSON.stringify(job.payload) },
    localTime: { S: job.localTime },
    createdAt: { S: new Date().toISOString() },
  };
  if (job.folder) item.folder = { S: String(job.folder) };

  if (!dryRun) {
    aws([
      'dynamodb',
      'put-item',
      '--table-name',
      tableName,
      '--item',
      JSON.stringify(item),
      '--condition-expression',
      'attribute_not_exists(pk) AND attribute_not_exists(sk)',
    ]);
  }
}

console.log(JSON.stringify({
  ok: true,
  dryRun,
  mode,
  slug,
  input: inputPath,
  images: uploaded.length,
  scheduled: jobs.map((job) => ({
    slug: job.slug,
    localTime: job.localTime,
    dueAt: job.dueAt,
    action: job.payload.action,
  })),
}, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'dry-run' || key === 'help') {
      parsed[key] = true;
    } else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`
Uso:
  npm run schedule:instagram -- --input <pasta-ou-zip> --mode carousel --slug meu-slug --caption "Legenda..."
  npm run schedule:instagram -- --input <pasta-ou-zip> --mode photos --slug meu-slug --captions-file captions.json

Opcoes:
  --input          Pasta ou .zip com imagens
  --mode           carousel ou photos (default: carousel)
  --slug           Slug S3 e base dos itens agendados
  --folder         Numero/nome da pasta para auditoria no DynamoDB
  --caption        Legenda unica para carousel, ou repetida em photos
  --captions-file  JSON array de legendas para photos, ou string/objeto para carousel
  --slots          Horarios locais SP separados por virgula (default: 09:00,12:00,15:00,18:00)
  --start-after    ISO datetime minimo para procurar lacuna (default: agora)
  --limit          Limite de imagens a usar
  --dry-run        Calcula lacunas e normaliza sem subir S3 nem gravar DynamoDB
`);
}

async function resolveInputDir(pathValue) {
  if (pathValue.toLowerCase().endsWith('.zip')) {
    const dir = mkdtempSync(join(tmpdir(), 'ig-upload-zip-'));
    execFileSync('unzip', ['-q', pathValue, '-d', dir], { stdio: 'inherit' });
    return dir;
  }
  return pathValue;
}

async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const images = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      images.push(...await listImages(fullPath));
    } else if (/\.(png|jpe?g|webp)$/i.test(entry.name) && !entry.name.startsWith('._')) {
      images.push(fullPath);
    }
  }
  return images.sort((a, b) => collator.compare(a, b));
}

async function loadCaptions(parsedArgs, selectedMode, count) {
  let value;
  if (parsedArgs['captions-file']) {
    const raw = await readFile(resolve(parsedArgs['captions-file']), 'utf8');
    value = JSON.parse(raw);
  } else if (parsedArgs.caption) {
    value = parsedArgs.caption;
  }

  if (!value) {
    throw new Error('Passe --caption ou --captions-file. A legenda deve ser revisada antes de agendar.');
  }

  if (selectedMode === 'carousel') {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value) && typeof value[0] === 'string') return [value[0]];
    if (typeof value.caption === 'string') return [value.caption];
    throw new Error('Legenda de carousel invalida. Use --caption ou JSON com { "caption": "..." }.');
  }

  if (typeof value === 'string') return Array.from({ length: count }, () => value);
  if (Array.isArray(value)) {
    if (value.length < count) throw new Error(`captions-file tem ${value.length} legendas, mas ha ${count} imagens.`);
    return value.slice(0, count).map(assertCaption);
  }
  if (Array.isArray(value.captions)) {
    if (value.captions.length < count) throw new Error(`captions tem ${value.captions.length} legendas, mas ha ${count} imagens.`);
    return value.captions.slice(0, count).map(assertCaption);
  }
  throw new Error('captions-file para photos deve ser array ou { "captions": [...] }.');
}

function assertCaption(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Legenda vazia ou invalida.');
  return value;
}

function normalizeImage(source, target) {
  execFileSync('magick', [
    source,
    '-auto-orient',
    '-strip',
    '-colorspace',
    'sRGB',
    '-background',
    'white',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    '-quality',
    '92',
    target,
  ], { stdio: 'inherit' });
}

async function loadScheduledDueAts() {
  const output = aws([
    'dynamodb',
    'query',
    '--table-name',
    tableName,
    '--key-condition-expression',
    'pk = :pk',
    '--expression-attribute-values',
    JSON.stringify({ ':pk': { S: `${storeAccount}#scheduled` } }),
    '--projection-expression',
    'dueAt',
    '--output',
    'json',
  ]);
  const parsed = JSON.parse(output);
  return new Set((parsed.Items || []).map((item) => item.dueAt?.S).filter(Boolean));
}

function nextFreeSlots(count, options) {
  const selected = [];
  const occupied = new Set(options.existingDueAts);
  const startLocal = localParts(options.startAfter);

  for (let dayOffset = 0; dayOffset < 60 && selected.length < count; dayOffset += 1) {
    const ymd = addDays(startLocal.ymd, dayOffset);
    for (const time of options.slotTimes) {
      const dueAt = localSlotToUtcIso(ymd, time);
      if (new Date(dueAt) <= options.startAfter) continue;
      if (occupied.has(dueAt)) continue;
      occupied.add(dueAt);
      selected.push({ dueAt, localTime: `${ymd} ${time} -03` });
      if (selected.length === count) break;
    }
  }

  if (selected.length < count) throw new Error('Nao encontrei lacunas suficientes nos proximos 60 dias.');
  return selected;
}

function localParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { ymd: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(ymd, days) {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
}

function localSlotToUtcIso(ymd, hhmm) {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0)).toISOString();
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function aws(argsValue) {
  return execFileSync('aws', [...argsValue, '--region', region], { encoding: 'utf8' });
}

async function headByte(url) {
  const response = await fetch(url, { headers: { range: 'bytes=0-0' } });
  return response.status;
}
