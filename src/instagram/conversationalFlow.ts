import type {
  InstagramFlowSession,
  InstagramInteractiveMessage,
} from './automationFlow.js';
import { resumeInstagramFlowMessage } from './automationFlow.js';
import {
  generateBedrockSalesReply,
  type BedrockSalesReplyResult,
} from '../ai/bedrockSalesResponder.js';
import type { LeadInteraction } from '../store/leadContextStore.js';

export interface ConversationalFlowReply {
  message: InstagramInteractiveMessage;
  source: BedrockSalesReplyResult['source'];
  fallbackReason?: BedrockSalesReplyResult['fallbackReason'];
}

export async function generateConversationalFlowReply(input: {
  inboundText: string;
  session: InstagramFlowSession;
  interactions?: LeadInteraction[];
  generateReply?: typeof generateBedrockSalesReply;
}): Promise<ConversationalFlowReply> {
  const resume = resumeInstagramFlowMessage(input.session);
  const resumeText = resume.kind === 'link_card'
    ? `${resume.title}. ${resume.subtitle}`
    : resume.kind === 'audio'
      ? 'Quer continuar?'
      : resume.text;
  const sitesWorkshop = input.session.campaign === 'sites_workshop';
  const generated = await (input.generateReply || generateBedrockSalesReply)({
    message: input.inboundText,
    promise: {
      kind: 'instagram_prospecting_conversation',
      label: sitesWorkshop ? 'Criação de sites com ChatGPT' : 'Estrutura de Prospecção Automatizada',
      trustedContext: [
        sitesWorkshop
          ? 'Sites permite criar, hospedar, refinar e compartilhar sites no ChatGPT.'
          : 'A estrutura ajuda a encontrar empresas, organizar oportunidades e preparar abordagens.',
        sitesWorkshop
          ? 'A pessoa pode iniciar o fluxo mencionando @Sites no ChatGPT e deve revisar conteúdo, links e comportamento antes de publicar.'
          : 'O destino desta campanha é a comunidade gratuita Saraiva no WhatsApp.',
        sitesWorkshop
          ? 'O passo a passo, o prompt-base e a revisão ficam na comunidade Saraiva no WhatsApp.'
          : 'O convite fica no botão ENTRAR NA COMUNIDADE enviado na conversa.',
        'Não há preço, prazo, garantia ou promessa de resultado autorizado nesta conversa.',
        `Etapa atual: ${input.session.stage}.`,
        `Próxima pergunta obrigatória: ${resumeText}`,
      ].join('\n'),
    },
    state: { stage: input.session.stage },
    summary: summarize(input.interactions),
    fallbackReply: `Entendi. ${resumeText}`,
  }, {
    enabled: true,
    temperature: 0.35,
    maxChars: 260,
  });

  const answer = generated.source === 'bedrock'
    ? declarativePart(generated.reply, resumeText)
    : '';
  const text = [completeSentence(answer), resumeText].filter(Boolean).join(' ').slice(0, 320);
  return {
    message: resume.kind === 'quick_replies'
      ? { ...resume, text }
      : { kind: 'text', text },
    source: generated.source,
    fallbackReason: generated.fallbackReason,
  };
}

function declarativePart(reply: string, resumeText: string): string {
  return reply
    .replace(resumeText, '')
    .replace(/(?:^|[.!]\s+)[^.!?]*\?\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function completeSentence(value: string): string {
  if (!value) return '';
  return /[.!…]$/u.test(value) ? value : `${value}.`;
}

function summarize(interactions?: LeadInteraction[]): string {
  return (interactions || [])
    .slice(-6)
    .map((item) => `${item.direction === 'in' ? 'pessoa' : 'saraiva'}: ${item.text}`)
    .join('\n');
}
