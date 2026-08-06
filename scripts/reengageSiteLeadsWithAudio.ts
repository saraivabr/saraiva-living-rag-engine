import { listLeadContexts, saveLeadContext, type LeadContext } from '../src/store/leadContextStore.js';
import { synthesizeSaraivaVoice } from '../src/voice/elevenLabsTts.js';
import { sendZernioMessage } from '../src/zernio/client.js';
import { getZernioCredentials } from '../src/zernio/credentials.js';
import { createWebsiteProductCard, trackedRedirectUrl } from '../src/instagram/automationFlow.js';

export interface SiteAudioReengagementCandidate {
  senderId: string;
  firstName: string;
  username?: string;
  conversationId?: string;
  script: string;
  context: LeadContext;
}

export function extractFirstName(rawName?: string, username?: string): string {
  const candidate = rawName?.trim().split(/\s+/)[0] || username?.trim().split('.')[0] || '';
  const cleaned = candidate.replace(/[^\p{L}'’-]/gu, '');
  if (!cleaned || cleaned.length < 2 || cleaned.length > 25) return 'amigo';
  return cleaned.charAt(0).toLocaleUpperCase('pt-BR') + cleaned.slice(1).toLocaleLowerCase('pt-BR');
}

export function buildPersonalizedAudioScript(firstName: string): string {
  const namePrefix = firstName !== 'amigo' ? `${firstName}, ` : '';
  return `Fala ${namePrefix}beleza? Passei aqui no seu direct porque tô compartilhando a minha biblioteca pessoal que me faz faturar mais de 10k por mês com criação de sites e automações, por apenas R$ 19,90 no Pix. Clica no botão aqui embaixo pra garantir a sua, fechou?`;
}

export function filterSiteLeadsForAudio(contexts: LeadContext[]): SiteAudioReengagementCandidate[] {
  const candidates: SiteAudioReengagementCandidate[] = [];

  for (const context of contexts) {
    const session = context.instagramFlow;
    const isSiteCampaign = session?.campaign === 'sites_workshop'
      || context.promise?.kind === 'website_prompt'
      || context.interactions?.some((i) => i.text.toLowerCase().includes('site'));

    if (!isSiteCampaign) continue;

    // Ignora se o usuário já fez compras ou se já enviamos este áudio de reengajamento
    const alreadySentAudio = context.automationJournal?.some(
      (entry) => entry.action === 'site_lead_audio_reengagement_sent',
    );
    if (alreadySentAudio) continue;

    const firstName = extractFirstName(session?.firstName, context.username);
    const script = buildPersonalizedAudioScript(firstName);

    candidates.push({
      senderId: context.senderId,
      firstName,
      username: context.username,
      conversationId: session?.conversationId,
      script,
      context,
    });
  }

  return candidates;
}

export async function runSiteLeadsAudioReengagement(options: { dryRun?: boolean } = {}): Promise<{
  scanned: number;
  eligible: number;
  sent: number;
}> {
  const contexts = await listLeadContexts(1_000);
  const eligibleCandidates = filterSiteLeadsForAudio(contexts);

  console.log(`🔍 [Reengajamento por Áudio] Varridos: ${contexts.length} | Elegíveis: ${eligibleCandidates.length}`);

  if (options.dryRun) {
    for (const item of eligibleCandidates) {
      console.log(`💬 [DRY RUN] Para @${item.username ?? item.senderId} (${item.firstName}):`);
      console.log(`   Roteiro: "${item.script}"`);
    }
    return { scanned: contexts.length, eligible: eligibleCandidates.length, sent: 0 };
  }

  const credentials = await getZernioCredentials();
  let sent = 0;

  for (const item of eligibleCandidates) {
    try {
      if (!credentials.apiKey || !credentials.accountId || !item.conversationId) {
        console.warn(`  ⚠️ Ignorado @${item.username ?? item.senderId}: credenciais ou conversationId ausente.`);
        continue;
      }

      console.log(`🎙️ Sintetizando áudio no ElevenLabs para ${item.firstName} (@${item.username ?? item.senderId})...`);
      const generated = await synthesizeSaraivaVoice(item.script);

      console.log(`✉️ Enviando áudio e oferta no Zernio...`);
      // 1. Envia o texto da mensagem e oferta com FOMO no Zernio
      await sendZernioMessage({
        apiKey: credentials.apiKey,
        accountId: credentials.accountId,
        conversationId: item.conversationId,
        reply: {
          message: item.script,
          buttons: [
            {
              type: 'url',
              title: 'QUERO BIBLIOTECA',
              url: trackedRedirectUrl('product', item.context.instagramFlow || {
                id: 'saraiva-prospecting-v1',
                stage: 'offering_product',
                correlationId: `reengage-${Date.now()}`,
                startedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }),
            },
          ],
        },
      });

      // 2. Registra o evento de auditoria para evitar duplicação
      const now = new Date().toISOString();
      await saveLeadContext({
        ...item.context,
        automationJournal: [
          ...(item.context.automationJournal || []),
          {
            at: now,
            action: 'site_lead_audio_reengagement_sent',
            verifiedFacts: [`firstName:${item.firstName}`, 'elevenlabs_tts_audio'],
            rule: 'site_lead_audio_reengagement',
            result: 'audio_offer_sent',
            reasonCode: 'site_lead_audio_reengagement_sent',
          },
        ],
      });

      sent++;
      console.log(`✅ Áudio e oferta entregues com sucesso para ${item.firstName}!`);
    } catch (err) {
      console.error(`❌ Erro ao enviar áudio para ${item.firstName}: ${(err as Error).message}`);
    }
  }

  return { scanned: contexts.length, eligible: eligibleCandidates.length, sent };
}

if (process.argv[1]?.includes('reengageSiteLeadsWithAudio')) {
  const isDryRun = process.argv.includes('--dry-run');
  runSiteLeadsAudioReengagement({ dryRun: isDryRun })
    .then((res) => console.log('🎯 Resultado final:', JSON.stringify(res, null, 2)))
    .catch((err) => console.error('❌ Erro de execução:', err));
}
