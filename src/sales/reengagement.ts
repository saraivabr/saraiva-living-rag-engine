import type { SalesLeadExport } from '../store/salesLeadStore.js';

export interface ReengagementCandidate {
  lead: SalesLeadExport;
  reason: string;
  message: string;
}

export function findUnansweredLeads(leads: SalesLeadExport[], limit = 25): ReengagementCandidate[] {
  return leads
    .filter((lead) => lead.sync?.status !== 'failed')
    .filter(hasNoRecentInboundAfterOutbound)
    .filter((lead) => lead.stage !== 'desqualificado')
    .map((lead) => ({
      lead,
      reason: resolveReason(lead),
      message: buildReengagementMessage(lead),
    }))
    .slice(0, limit);
}

function hasNoRecentInboundAfterOutbound(lead: SalesLeadExport): boolean {
  const interactions = lead.interactions || [];
  if (interactions.length === 0) return true;
  const last = interactions[interactions.length - 1];
  return last?.direction === 'out';
}

function resolveReason(lead: SalesLeadExport): string {
  if (lead.stage === 'pagamento_pendente_verificacao') return 'alegou pagamento, mas ainda falta validar no provedor';
  if (lead.stage === 'comprar_live') return 'pediu ou indicou compra, mas nao confirmou entrada';
  if (lead.temperature === 'quente') return 'lead quente sem continuidade depois da ultima resposta';
  if (lead.stage === 'diagnostico') return 'ficou no diagnostico e ainda nao respondeu a pergunta de contexto';
  return 'conversa iniciada sem proximo passo respondido';
}

export function buildReengagementMessage(lead: SalesLeadExport): string {
  const useCase = lead.crmNote.match(/Aplicacao: ([^\n]+)/)?.[1]?.trim();
  const pain = lead.crmNote.match(/Dor: ([^\n]+)/)?.[1]?.trim();
  const offer = lead.offer.toLowerCase();

  if (lead.stage === 'pagamento_pendente_verificacao') {
    return [
      'recebi tua mensagem sobre o pagamento.',
      '',
      'a venda e o acesso so ficam confirmados depois que o provedor registrar o pagamento como concluido.',
    ].join('\n');
  }

  if (lead.stage === 'comprar_live') {
    return [
      'passando aqui rapido pra nao deixar tua ideia morrer no meio do caminho.',
      '',
      offer.includes('workshop')
        ? 'voce chegou a abrir o checkout do workshop ou travou em alguma duvida antes de entrar?'
        : 'voce quer que eu te ajude a definir o proximo passo sem te mandar uma oferta fora de contexto?',
    ].join('\n');
  }

  if (pain) {
    return [
      'pensei melhor no que voce comentou.',
      '',
      `quando aparece "${pain}", normalmente o problema nao e so ferramenta, e continuidade do processo.`,
      '',
      'qual parte mais trava hoje: responder rapido, lembrar contexto, fazer follow-up ou passar pro humano certo?',
    ].join('\n');
  }

  if (useCase) {
    return [
      'voltei aqui porque teu caso parece dar pra transformar em um primeiro fluxo bem direto.',
      '',
      `sobre ${useCase}: hoje isso trava mais por falta de tempo, falta de padrao ou porque depende de alguem lembrar?`,
    ].join('\n');
  }

  return [
    'voltei aqui pra nao te mandar resposta generica.',
    '',
    'se voce fosse escolher uma coisa pra tirar da mao hoje, seria atendimento, follow-up, vendas, conteudo ou organizacao interna?',
  ].join('\n');
}
