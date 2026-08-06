import type {
  InstagramFlowSession,
  InstagramInteractiveMessage,
} from './automationFlow.js';
import { resumeInstagramFlowMessage } from './automationFlow.js';
import {
  generateConversationalSalesReply,
  type ConversationalSalesGenerator,
  type ConversationalSalesReplyResult,
} from '../ai/conversationalSalesResponder.js';
import type { LeadInteraction } from '../store/leadContextStore.js';

export interface ConversationalFlowReply {
  message: InstagramInteractiveMessage;
  source: ConversationalSalesReplyResult['source'];
  fallbackReason?: ConversationalSalesReplyResult['fallbackReason'];
}

export async function generateConversationalFlowReply(input: {
  inboundText: string;
  session: InstagramFlowSession;
  interactions?: LeadInteraction[];
  generateReply?: ConversationalSalesGenerator;
}): Promise<ConversationalFlowReply> {
  const resume = resumeInstagramFlowMessage(input.session);
  const resumeText = resume.kind === 'link_card'
    ? `${resume.title}. ${resume.subtitle}`
    : resume.kind === 'audio'
      ? 'Quer continuar?'
      : resume.text;
  const sitesWorkshop = input.session.campaign === 'sites_workshop';
  const postDeliverySitesAssistant = sitesWorkshop && Boolean(input.session.promptDeliveredAt);
  if (postDeliverySitesAssistant && asksWhereDeliveredContentIs(input.inboundText)) {
    return {
      message: { kind: 'text', text: resumeText },
      source: 'fallback',
    };
  }
  const canonicalLibraryAnswer = postDeliverySitesAssistant
    ? canonicalLibraryReply(input.inboundText)
    : undefined;
  if (canonicalLibraryAnswer) {
    return {
      message: { kind: 'text', text: canonicalLibraryAnswer },
      source: 'fallback',
    };
  }
  if (postDeliverySitesAssistant && asksAboutPricing(input.inboundText)) {
    return {
      message: { kind: 'text', text: postDeliveryAssistantFallback(input.inboundText, input.session.path) },
      source: 'fallback',
    };
  }
  if (postDeliverySitesAssistant && mentionsSocialProof(input.inboundText)) {
    return {
      message: { kind: 'text', text: postDeliveryAssistantFallback(input.inboundText, input.session.path) },
      source: 'fallback',
    };
  }
  const assistantFallback = postDeliveryAssistantFallback(input.inboundText, input.session.path);
  const sitesTrustedContext = postDeliverySitesAssistant
    ? [
        'A pessoa já recebeu gratuitamente o prompt usado no vídeo e o único link comercial permitido.',
        'A Biblioteca Secreta reúne 24 prompts prontos para copiar, adaptar e usar, custa R$ 19,90 e tem acesso permanente. Ela não é um gerador.',
        'O prompt e o link já foram entregues. Não repita o link, a oferta, o preço, a quantidade, o CTA ou o prompt, salvo se a pessoa perguntar diretamente sobre esse assunto.',
        'Agora aja como um assistente prático: responda a dúvida e ajude a adaptar o prompt ao segmento, objetivo, público e projeto informados.',
        'Se não houver depoimentos, nunca invente. Sugira provas reais como portfólio, processo, credenciais e fatos verificáveis.',
        'Se perguntarem prazo ou preço sem referência confiável, não dê prazo numérico nem valide valor. Explique as variáveis e pergunte o escopo.',
        'Faça no máximo uma pergunta curta e útil por resposta. Não force uma nova venda.',
        'Não mencione WhatsApp, comunidade, laboratório, consultoria, outra ferramenta ou outra oferta.',
      ]
    : [
        'A promessa do Reel é entregar gratuitamente o prompt usado no vídeo.',
        'Primeiro a pessoa escolhe entre usar na própria empresa ou criar e vender sites para clientes.',
        'O conteúdo comercial ainda não foi entregue. Não mencione produto, preço, quantidade, acesso, CTA ou oferta nesta etapa.',
        'Não use a expressão Gerador de Prompts e não apresente nenhuma ferramenta.',
        'Responda somente à dúvida atual e retome a pergunta obrigatória.',
        'Não mencione WhatsApp, comunidade, laboratório, consultoria, outra ferramenta ou outra oferta.',
      ];
  const generated = await (input.generateReply || generateConversationalSalesReply)({
    message: input.inboundText,
    promise: {
      kind: 'instagram_prospecting_conversation',
      label: sitesWorkshop
        ? (postDeliverySitesAssistant ? 'Assistente de adaptação do prompt' : 'Prompt gratuito do vídeo')
        : 'Estrutura de Prospecção Automatizada',
      trustedContext: [
        ...(sitesWorkshop
          ? sitesTrustedContext
          : [
              'A estrutura ajuda a encontrar empresas, organizar oportunidades e preparar abordagens.',
              'O destino desta campanha é a comunidade gratuita Saraiva no WhatsApp.',
              'O convite fica no botão ENTRAR NA COMUNIDADE enviado na conversa.',
              'Não há preço, prazo, garantia ou promessa de resultado autorizado nesta conversa.',
            ]),
        `Etapa atual: ${input.session.stage}.`,
        postDeliverySitesAssistant
          ? `Caminho escolhido: ${input.session.path === 'build' ? 'criar sites para clientes' : 'usar na própria empresa'}.`
          : `Próxima pergunta obrigatória: ${resumeText}`,
      ].join('\n'),
    },
    state: { stage: input.session.stage },
    summary: summarize(input.interactions),
    fallbackReply: postDeliverySitesAssistant ? assistantFallback : `Entendi. ${resumeText}`,
  }, {
    enabled: true,
    temperature: 0.35,
    maxChars: 260,
  });

  if (postDeliverySitesAssistant) {
    const reply = safePostDeliveryReply(generated.reply, assistantFallback, input.inboundText);
    return {
      message: { kind: 'text', text: reply },
      source: generated.source,
      fallbackReason: generated.fallbackReason,
    };
  }

  const generatedAnswer = generated.source !== 'fallback'
    ? declarativePart(generated.reply, resumeText)
    : '';
  const answer = sitesWorkshop && containsEarlyCommercialOffer(generatedAnswer)
    ? ''
    : generatedAnswer;
  const text = appendRequiredResume(answer, resumeText);
  return {
    message: resume.kind === 'quick_replies'
      ? { ...resume, text }
      : { kind: 'text', text },
    source: generated.source,
    fallbackReason: generated.fallbackReason,
  };
}

function postDeliveryAssistantFallback(
  inboundText: string,
  path?: InstagramFlowSession['path'],
): string {
  const text = normalize(inboundText);
  if (mentionsSocialProof(text)) {
    return 'Não invente depoimentos. Use portfólio, processo, credenciais e outros fatos reais. Que prova verdadeira esse cliente já tem?';
  }
  if (/\b(?:quanto tempo|prazo|demora|levo)\b.{0,60}\b(?:construir|criar|fazer|site|lovable)\b|\b(?:construir|criar|fazer)\b.{0,40}\bquanto tempo\b/u.test(text)) {
    return 'O prazo depende do escopo, do conteúdo, das integrações e das revisões. É uma landing page ou um site com várias páginas?';
  }
  if (asksAboutPricing(text)) {
    return 'O preço depende do escopo, da complexidade e do que você vai entregar. Quantas páginas, integrações e revisões estão incluídas?';
  }
  return path === 'build'
    ? 'Posso te ajudar a adaptar o prompt ao projeto do cliente. Qual é o segmento e o objetivo principal desse site?'
    : 'Posso te ajudar a adaptar o prompt ao seu negócio. Qual é o segmento e o objetivo principal do site?';
}

function canonicalLibraryReply(inboundText: string): string | undefined {
  const text = normalize(inboundText);
  if (/\bgerador(?:a|es)?(?:\s+de\s+prompts?)?\b/u.test(text)) {
    return 'Não. A Biblioteca Secreta é uma coleção de 24 prompts prontos para copiar e adaptar; não é um gerador. Qual tipo de projeto você quer criar?';
  }
  const barePriceQuestion = /^(?:(?:e\s+)?(?:o\s+)?(?:preco|valor)|quanto custa|qual (?:e\s+)?o (?:preco|valor))\s*[?!.]*$/u.test(text);
  const librarySubject = /\b(?:biblioteca secreta|24\s+prompts?|produto pago|versao paga|acesso permanente)\b/u.test(text);
  const libraryCommercialQuestion = /\bbiblioteca\b.{0,40}\b(?:preco|valor|custa|comprar|compra|tem|inclui|acesso|funciona|serve)\b|\b(?:preco|valor|custa|comprar|compra|tem|inclui|acesso|funciona|serve)\b.{0,40}\bbiblioteca\b/u.test(text);
  if (!barePriceQuestion && !librarySubject && !libraryCommercialQuestion) return undefined;
  return 'A Biblioteca Secreta reúne 24 prompts, custa R$ 19,90 e tem acesso permanente. Quer que eu te ajude a escolher por onde começar?';
}

function asksWhereDeliveredContentIs(value: string): boolean {
  const text = normalize(value);
  return /\b(?:cade|onde (?:esta|fica)|nao achei|nao recebi|manda|envia|reenvia)\b.{0,60}\b(?:prompt|link|biblioteca|conteudo)\b/u.test(text)
    || /\b(?:prompt|link|biblioteca|conteudo)\b.{0,40}\b(?:cade|onde|sumiu|de novo|novamente)\b/u.test(text);
}

function safePostDeliveryReply(value: string, fallback: string, inboundText: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  const durationClaim = /\b(?:minutos?|horas?|dias?|semanas?|mes(?:es)?)\b/u.test(normalize(text));
  const untrustedPricingAnswer = (asksAboutPricing(inboundText) || discussesUntrustedPricing(text))
    && text !== fallback;
  const repeatsCommercialOffer = containsCommercialOffer(text);
  const nakedDomain = /(?:^|[^a-z0-9@])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s)]*)?/iu.test(text);
  const inventedTestimonial = containsInventedTestimonial(text, inboundText);
  if (
    !text
    || /\bgerador(?:a|es)?(?:\s+de\s+prompts?)?\b/iu.test(text)
    || /https?:\/\//iu.test(text)
    || nakedDomain
    || durationClaim
    || untrustedPricingAnswer
    || inventedTestimonial
    || (text.match(/\?/g) || []).length > 1
    || text.length > 320
    || repeatsCommercialOffer
  ) return fallback;
  return text;
}

function containsInventedTestimonial(reply: string, inboundText: string): boolean {
  const inbound = normalize(inboundText);
  if (!mentionsSocialProof(inbound)) return false;
  const output = normalize(reply);
  const quotedOrDictatedClaim = /["“”'‘’]|\b(?:use|coloque|adicione|crie|invente|escreva|publique)\s*:/iu.test(reply);
  if (quotedOrDictatedClaim) return true;
  const explicitlyRejectsFabrication = /\b(?:nao|nunca|jamais)\s+(?:invente|fabrique|crie)\b/u.test(output);
  const redirectsToRealEvidence = /\b(?:provas? reais?|fatos? reais?|fatos? verificaveis?|portfolio|processo|credenciais|fotos? reais?)\b/u.test(output);
  if (explicitlyRejectsFabrication || redirectsToRealEvidence) return false;
  return true;
}

function mentionsSocialProof(value: string): boolean {
  const text = normalize(value);
  return /\b(?:depoimentos?|avaliacao|avaliacoes|prova social|reviews?)\b/u.test(text);
}

function asksAboutPricing(value: string): boolean {
  const text = normalize(value);
  const pricingIntent = /\b(?:cobr[a-z]*|cust[a-z]*|orcamento|preco|investimento|faixa|esta barato|esta caro|valor)\b/u.test(text);
  const serviceContext = /\b(?:site|landing page|pagina|projeto|servico|cliente|fazer|criar|construir|entregar)\b/u.test(text);
  return /r\s*\$\s*\d/iu.test(text) || (pricingIntent && serviceContext);
}

function discussesUntrustedPricing(value: string): boolean {
  const text = normalize(value);
  return /\b(?:cobr[a-z]*|cust[a-z]*|orcamento|preco|investimento|valor|faixa|media)\b/u.test(text);
}

function containsEarlyCommercialOffer(value: string): boolean {
  return containsCommercialOffer(value);
}

function containsCommercialOffer(value: string): boolean {
  return /\bgerador(?:a|es)?(?:\s+de\s+prompts?)?\b|\bbiblioteca\b|\b(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|vinte|trinta|quarenta|cinquenta|cem)\s+prompts?\b|R\s*\$|\b\d+(?:[.,]\d{1,2})?\s+reais?\b|\b(?:custa|cobre|cobrar|por|preco|valor|apenas)\b.{0,40}\breais?\b|\b19[,.]90\b|\bacesso\s+(?:permanente|vitalicio|por\s+\w+)\b|\b(?:oferta|plano|checkout|assinatura|compra|comprar|adquirir|premium)\b|\b(?:produto|vers[aã]o|acesso)\b.{0,25}\b(?:pag[oa]|premium|disponivel|disponível|comprar|conhecer)\b|\b(?:pag[oa]|premium)\b.{0,25}\b(?:produto|vers[aã]o|acesso)\b/iu.test(normalize(value));
}

function appendRequiredResume(answer: string, resumeText: string, maxChars = 320): string {
  const required = resumeText.trim();
  const budget = maxChars - required.length - 1;
  if (!answer || budget < 4) return required.slice(0, maxChars);
  const completed = completeSentence(answer);
  const prefix = completed.length <= budget
    ? completed
    : truncateSentence(completed, budget);
  return prefix ? `${prefix} ${required}` : required;
}

function truncateSentence(value: string, maxChars: number): string {
  const clipped = value
    .slice(0, Math.max(0, maxChars - 1))
    .replace(/\s+\S*$/u, '')
    .replace(/[\s,;:.!?\u2026]+$/u, '')
    .trim();
  return clipped ? `${clipped}.` : '';
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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
