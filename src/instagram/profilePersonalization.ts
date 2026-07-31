export interface InstagramOfficialProfile {
  id: string;
  name?: string;
  username?: string;
  biography?: string;
  website?: string;
  accountType?: string;
  isVerifiedUser?: boolean;
}

export interface ProfileFact {
  field: 'biography' | 'website' | 'account_type' | 'verified';
  value: string;
  source: 'meta_official_profile';
  evidence: string;
  confidence: number;
  allowedInAudio: boolean;
}

export interface SafeProfileBrief {
  firstName?: string;
  username?: string;
  facts: ProfileFact[];
  hypothesis: string;
}

export function buildSafeProfileBrief(profile: InstagramOfficialProfile): SafeProfileBrief {
  const firstName = reliableFirstName(profile.name);
  const facts: ProfileFact[] = [];
  const professionalCategory = professionalCategoryFromBiography(profile.biography);
  if (professionalCategory) {
    facts.push({
      field: 'biography',
      value: professionalCategory.value,
      source: 'meta_official_profile',
      evidence: `authorized biography matched allowlisted professional category: ${professionalCategory.category}`,
      confidence: 0.85,
      allowedInAudio: true,
    });
  }
  const website = compact(profile.website);
  if (website) {
    facts.push({
      field: 'website',
      value: `você mantém o site ${safeHostname(website)}`,
      source: 'meta_official_profile',
      evidence: 'website returned by the authorized Meta User Profile endpoint',
      confidence: 0.95,
      allowedInAudio: false,
    });
  }
  const accountType = compact(profile.accountType);
  if (accountType && /BUSINESS|CREATOR/i.test(accountType)) {
    facts.push({
      field: 'account_type',
      value: `seu perfil é ${/CREATOR/i.test(accountType) ? 'de criador' : 'profissional'}`,
      source: 'meta_official_profile',
      evidence: 'account_type returned by the authorized Meta User Profile endpoint',
      confidence: 1,
      allowedInAudio: true,
    });
  }
  if (profile.isVerifiedUser === true) {
    facts.push({
      field: 'verified',
      value: 'seu perfil é verificado',
      source: 'meta_official_profile',
      evidence: 'is_verified_user returned by the authorized Meta User Profile endpoint',
      confidence: 1,
      allowedInAudio: false,
    });
  }

  return {
    firstName,
    username: compact(profile.username),
    facts: facts.slice(0, 2),
    hypothesis: facts.some((fact) => fact.allowedInAudio)
      ? 'Há contexto profissional oficial suficiente para personalização leve.'
      : 'Sem contexto profissional confiável; usar apresentação neutra.',
  };
}

function reliableFirstName(name?: string): string | undefined {
  const compactName = compact(name);
  if (!compactName || compactName.includes('@') || /\d/.test(compactName)) return undefined;
  const first = compactName.split(/\s+/)[0]?.replace(/[^\p{L}'’-]/gu, '');
  if (!first || first.length < 2 || first.length > 30) return undefined;
  return first.charAt(0).toLocaleUpperCase('pt-BR') + first.slice(1).toLocaleLowerCase('pt-BR');
}

function professionalCategoryFromBiography(
  biography?: string,
): { category: string; value: string } | undefined {
  const value = compact(biography);
  if (!value) return undefined;
  const sensitive = /\b(saúde|doença|religião|política|sexual|raça|etnia|renda|salário|idade|diagnóstico)\b/i;
  if (sensitive.test(value)) return undefined;
  const categories: Array<[RegExp, string, string]> = [
    [/\b(marketing|social media|tráfego|branding)\b/i, 'marketing', 'você atua com marketing'],
    [/\b(vendas|comercial|closer|sdr)\b/i, 'sales', 'você atua na área comercial'],
    [/\b(fundador|fundadora|ceo|empreendedor|empreendedora|empresa|negócio)\b/i, 'business', 'você atua construindo negócios'],
    [/\b(consultor|consultora|mentor|mentora|especialista)\b/i, 'consulting', 'você atua com consultoria ou mentoria'],
    [/\b(criador|criadora|designer|conteúdo)\b/i, 'creative', 'você trabalha com criação'],
    [/\b(tecnologia|software|desenvolvedor|desenvolvedora|engenheiro|engenheira)\b/i, 'technology', 'você atua com tecnologia'],
  ];
  const match = categories.find(([pattern]) => pattern.test(value));
  return match ? { category: match[1], value: match[2] } : undefined;
}

function safeHostname(value: string): string {
  try {
    return new URL(value.startsWith('http') ? value : `https://${value}`).hostname.replace(/^www\./, '');
  } catch {
    return 'informado no seu perfil';
  }
}

function compact(value?: string): string | undefined {
  const result = value?.replace(/\s+/g, ' ').trim();
  return result || undefined;
}
