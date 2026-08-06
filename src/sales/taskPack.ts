import type { SalesLeadExport } from '../store/salesLeadStore.js';
import { findUnansweredLeads, type ReengagementCandidate } from './reengagement.js';

export interface SocialSellingTaskPack {
  summary: {
    generatedAt: string;
    source: string;
    totalLeads: number;
    unansweredCandidates: number;
    publicCommentRule: string;
    suggestedMessagesWithBio: number;
    primaryAutomation: string;
    targetPostProfile: string;
    blocker: string;
    byOffer: Record<string, number>;
  };
  rows: SocialSellingTaskRow[];
}

export interface SocialSellingTaskRow {
  priority: number;
  username: string;
  senderId: string;
  score: number;
  stage: string;
  temperature: string;
  icpFit: string;
  offer: string;
  promiseLabel: string;
  reason: string;
  nextAction: string;
  instagramUrl: string;
  postPermalink: string;
  suggestedMessage: string;
  lastInbound: string;
  historyNote: string;
  updatedAt: string;
}

const publicCommentRule = 'Comentario publico direciona para DM; caminho/aula/material so na conversa privada.';

export function buildSocialSellingTaskPack(leads: SalesLeadExport[], limit = 100): SocialSellingTaskPack {
  const operationalLeads = leads.filter((lead) => !isSyntheticValidationLead(lead));
  const candidates = findUnansweredLeads(operationalLeads, limit);
  const rows = candidates.map(formatTaskRow);
  return {
    summary: {
      generatedAt: new Date().toISOString(),
      source: 'Lambda Instagram @saraiva.ai',
      totalLeads: operationalLeads.length,
      unansweredCandidates: rows.length,
      publicCommentRule,
      suggestedMessagesWithBio: rows.filter((row) => hasBioCta(row.suggestedMessage)).length,
      primaryAutomation: 'Posts do @saraiva.ai usam Lambda Meta: comentario publico direcionando para DM + private reply + historico interno.',
      targetPostProfile: '@saraiva.ai',
      blocker: 'Responder manualmente os leads sem resposta priorizados abaixo.',
      byOffer: countByOffer(rows),
    },
    rows,
  };
}

function isSyntheticValidationLead(lead: SalesLeadExport): boolean {
  const text = [
    lead.senderId,
    lead.username,
    lead.lastInbound,
    lead.lastOutbound,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(codex|healthcheck|validacao|validacao final|teste codex)\b/.test(text);
}

function formatTaskRow(candidate: ReengagementCandidate, index: number): SocialSellingTaskRow {
  const lead = candidate.lead;
  return {
    priority: index + 1,
    username: lead.username ? `@${lead.username.replace(/^@/, '')}` : '',
    senderId: lead.senderId,
    score: lead.score,
    stage: lead.stage,
    temperature: lead.temperature,
    icpFit: lead.icpFit,
    offer: lead.offer,
    promiseLabel: lead.promiseLabel,
    reason: candidate.reason,
    nextAction: lead.nextAction,
    instagramUrl: instagramUrl(lead),
    postPermalink: lead.postPermalink || '',
    suggestedMessage: candidate.message,
    lastInbound: lead.lastInbound || '',
    historyNote: lead.lastOutbound ? 'historico privado existe no CRM; nao reaproveitar como comentario publico' : '',
    updatedAt: lead.updatedAt,
  };
}

function instagramUrl(lead: SalesLeadExport): string {
  const handle = lead.username?.replace(/^@/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
}

function hasBioCta(text: string): boolean {
  return /\b(comente\s+aula|link da bio|esta na bio|minha bio|na bio)\b/i.test(text);
}

function countByOffer(rows: SocialSellingTaskRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.offer || row.promiseLabel || 'sem oferta';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
