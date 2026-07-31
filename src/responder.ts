import { config } from './config.js';
import {
  getRecentMedia,
  getMediaById,
  getComments,
  replyToComment,
  sendPrivateReply,
  resolveUserId,
  getAccountUsername,
} from './instagram/client.js';
import { decideReply } from './ai/responder.js';
import { loadStore, type RepliedStore } from './store/repliedStore.js';
import { saveLeadContext } from './store/leadContextStore.js';
import { loadPublishedMediaContextsById } from './store/mediaContextStore.js';
import {
  resolveCommentCampaignCopy,
  resolveKnownMediaPromise,
  resolvePostPromise,
} from './socialSelling/flow.js';
import { isMediaDisabled } from './disabledMedia.js';
import type { IgComment } from './instagram/types.js';
import { matchesCampaignTrigger, matchesMediaCampaignTrigger } from './campaignTrigger.js';

/** Estado resolvido uma vez e reutilizado entre ciclos. */
interface Runtime {
  userId: string;
  ownUsername: string;
  store: RepliedStore;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let runtime: Runtime | null = null;

async function getRuntime(): Promise<Runtime> {
  if (runtime) return runtime;
  const userId = await resolveUserId();
  const [ownUsername, store] = await Promise.all([
    getAccountUsername(userId),
    loadStore(),
  ]);
  runtime = { userId, ownUsername, store };
  console.log(`▶ Conta: @${ownUsername || '(desconhecida)'} (id ${userId})`);
  console.log(`▶ Modo: ${config.behavior.dryRun ? 'DRY_RUN (não posta)' : 'AO VIVO (posta de verdade)'}`);
  return runtime;
}

function matchesCampaign(comment: IgComment, mediaId?: string): boolean {
  return mediaId
    ? matchesMediaCampaignTrigger(mediaId, comment.text, config.behavior.triggerWords)
    : matchesCampaignTrigger(comment.text, config.behavior.triggerWords);
}

const diagnosticIntentPhrases = [
  'como funciona',
  'mais informacoes',
  'quero saber',
  'tenho interesse',
  'quanto custa',
  'qual o valor',
  'qual o preco',
  'podemos conversar',
  'quero comprar',
  'quero contratar',
  'revender',
  'revenue share',
  'comissao',
  'demonstracao',
];

function isDiagnosticCandidate(comment: IgComment): boolean {
  const text = comment.text.trim();
  const lower = text.toLowerCase();
  if (!/[a-záàâãéêíóôõúç]/i.test(text)) return false;
  if (text.length < 4) return false;
  if (/https?:\/\//i.test(text)) return false;
  if (/^\s*@[\w.]+\s*$/.test(text)) return false;
  if (/\b(follow|promo|bitcoin|crypto|forex|investimento garantido|renda extra)\b/i.test(text)) return false;
  if (/\b(merda|porra|golpe|lixo|idiota)\b/i.test(text)) return false;
  if (lower.includes('saraiva.ai')) return false;
  return matchesCampaignTrigger(text, diagnosticIntentPhrases);
}

/** Um comentário é "pendente" se ainda precisa de resposta pública ou DM de social selling. */
function isPending(comment: IgComment, rt: Runtime, mediaId: string): boolean {
  if (!comment.text?.trim()) return false;
  if (comment.username && comment.username === rt.ownUsername) return false;
  const alreadyRepliedByUs = comment.replies?.data?.some(
    (r) => r.username && r.username === rt.ownUsername,
  );
  const publicDone = rt.store.hasPublicReply(comment.id) || Boolean(alreadyRepliedByUs);
  const privateDone = rt.store.hasPrivateReply(comment.id);
  const shouldInbox = matchesCampaign(comment, mediaId) || isDiagnosticCandidate(comment);
  return !publicDone || (shouldInbox && !privateDone);
}

/** Executa um ciclo completo: varre posts recentes e responde comentários novos. */
export async function runCycle(): Promise<void> {
  if (!config.behavior.enabled) {
    console.log('⏸ Respondedor completamente desativado (RESPONDER_ENABLED=false). Pulando ciclo.');
    return;
  }

  const rt = await getRuntime();
  const mediaContexts = await loadPublishedMediaContextsById();
  const campaignMediaIds = config.behavior.commentCampaignMediaIds;
  const [recentMedia, priorityMedia, campaignMedia] = await Promise.all([
    getRecentMedia(rt.userId, config.behavior.mediaLimit),
    loadPriorityMedia(),
    loadMediaByIds(campaignMediaIds),
  ]);
  const media = campaignMediaIds.length > 0
    ? uniqueMedia(campaignMedia)
    : uniqueMedia([...priorityMedia, ...recentMedia]);
  console.log(
    `\n⏱  Ciclo iniciado — ${media.length} post(s) `
    + `(${campaignMedia.length} de campanha, ${priorityMedia.length} prioritario(s), ${recentMedia.length} recente(s))`,
  );

  let answered = 0;
  let dmed = 0;
  let skipped = 0;
  let processed = 0;

  for (const post of media) {
    if (processed >= config.behavior.maxCommentsPerCycle) break;
    if (isMediaDisabled({ id: post.id, permalink: post.permalink })) {
      console.log(`  ⏸  Post ${post.id} ignorado por DISABLED_MEDIA_IDS/DISABLED_PERMALINKS.`);
      continue;
    }

    let comments: IgComment[];
    try {
      comments = await getComments(post.id);
    } catch (err) {
      console.warn(`  ⚠ Falha ao ler comentários do post ${post.id}: ${(err as Error).message}`);
      continue;
    }

    const pending = comments.filter((comment) => {
      if (campaignMediaIds.length > 0 && !matchesCampaign(comment, post.id)) {
        return false;
      }
      return isPending(comment, rt, post.id);
    });
    if (pending.length === 0) continue;

    for (const comment of pending) {
      if (processed >= config.behavior.maxCommentsPerCycle) break;

      try {
        processed++;
        const isCampaign = matchesCampaign(comment, post.id);
        const isDiagnostic = isDiagnosticCandidate(comment);
        const mediaContext = mediaContexts.get(post.id);
        const promise = resolveKnownMediaPromise(post.id) ?? mediaContext?.promise ?? resolvePostPromise({
          postCaption: mediaContext?.caption || post.caption,
          commentText: comment.text,
        });
        const publicAlreadyDone = rt.store.hasPublicReply(comment.id)
          || Boolean(comment.replies?.data?.some((r) => r.username && r.username === rt.ownUsername));

        if (isCampaign || isDiagnostic) {
          const campaignCopy = resolveCommentCampaignCopy(promise, comment.id);
          const publicMessage = campaignCopy.publicReply;
          const privateMessage = campaignCopy.privateReply;
          if (config.behavior.dryRun) {
            console.log(`  💬 [DRY] @${comment.username ?? '?'}: "${comment.text}"`);
            console.log(`      → promessa detectada: ${promise.label} (${campaignCopy.variant})`);
            if (!rt.store.hasPrivateReply(comment.id)) {
              console.log(`      → DM: "${privateMessage.replace(/\n/g, ' / ')}"`);
            }
            if (!publicAlreadyDone) console.log(`      → comentario publico: "${publicMessage}"`);
          } else {
            if (!rt.store.hasPrivateReply(comment.id)) {
              try {
                const senderId = await sendPrivateReply(comment.id, privateMessage);
                await saveLeadContext({
                  senderId,
                  commentId: comment.id,
                  username: comment.username,
                  postId: post.id,
                  postPermalink: post.permalink,
                  promise,
                });
                await rt.store.markPrivateReply(comment.id);
                dmed++;
                console.log(`      → DM enviada com ${promise.label} (${campaignCopy.variant})`);
                await sleep(config.behavior.replyDelayMs);
              } catch (err) {
                if (!isAlreadyRepliedError(err)) throw err;
                await rt.store.markPrivateReply(comment.id);
                console.log(`      → DM ja tinha sido consumida pela Meta; marcado como enviado.`);
              }
            }
            if (!publicAlreadyDone) {
              try {
                await replyToComment(comment.id, publicMessage);
                await rt.store.markPublicReply(comment.id);
                answered++;
                console.log(`  ✅ @${comment.username ?? '?'}: "${comment.text}"`);
                console.log(`      → comentario publico depois da confirmacao da DM: "${publicMessage}"`);
                await sleep(config.behavior.replyDelayMs);
              } catch (err) {
                if (!isAlreadyRepliedError(err)) throw err;
                await rt.store.markPublicReply(comment.id);
                console.log(`  ↪ @${comment.username ?? '?'}: comentario publico ja tinha resposta.`);
              }
            }
          }
          continue;
        }

        if (publicAlreadyDone) continue;

        const decision = await decideReply({
          commentText: comment.text,
          username: comment.username,
          postCaption: post.caption,
        });

        if (decision.action === 'skip') {
          await rt.store.markPublicReply(comment.id); // marca pra não reavaliar toda hora
          skipped++;
          console.log(`  ⏭  @${comment.username ?? '?'}: pulado (${decision.reason})`);
          continue;
        }

        if (config.behavior.dryRun) {
          console.log(`  💬 [DRY] @${comment.username ?? '?'}: "${comment.text}"`);
          console.log(`      → responderia: "${decision.message}"`);
        } else {
          await replyToComment(comment.id, decision.message);
          await rt.store.markPublicReply(comment.id);
          console.log(`  ✅ @${comment.username ?? '?'}: "${comment.text}"`);
          console.log(`      → respondido: "${decision.message}"`);
          await sleep(config.behavior.replyDelayMs);
        }
        answered++;
      } catch (err) {
        console.warn(`  ⚠ Erro ao tratar comentário ${comment.id}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`✔ Ciclo concluído — ${answered} resposta(s), ${dmed} DM, ${skipped} pulado(s)`);
}

function isAlreadyRepliedError(error: unknown): boolean {
  const message = (error as Error).message || '';
  return message.includes('2534023')
    || message.toLowerCase().includes('already has a reply')
    || message.toLowerCase().includes('ja tem uma resposta')
    || message.toLowerCase().includes('já tem uma resposta');
}

async function loadPriorityMedia() {
  return loadMediaByIds(config.behavior.priorityMediaIds);
}

async function loadMediaByIds(mediaIds: readonly string[]) {
  const media = await Promise.all(
    mediaIds.map(async (mediaId) => {
      try {
        return await getMediaById(mediaId);
      } catch (err) {
        console.warn(`  ⚠ Falha ao carregar post configurado ${mediaId}: ${(err as Error).message}`);
        return null;
      }
    }),
  );
  return media.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function uniqueMedia(media: Awaited<ReturnType<typeof getRecentMedia>>) {
  const seen = new Set<string>();
  return media.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
