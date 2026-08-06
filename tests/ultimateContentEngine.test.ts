import test from 'node:test';
import assert from 'node:assert/strict';
import { contentGenerationEngine } from '../src/contentEngine/ultimateContentEngine.js';

test('Motor de Geração de Conteúdo Incrível: gera roteiros virais completos baseados em dados', async () => {
  const script = await contentGenerationEngine.generateViralScript({
    targetAudience: 'Empresários B2B',
    niche: 'Agentes de IA e Prospecção',
    coreOffer: 'Sistema Automático de Prospecção',
    mainPainPoint: 'Falta de clientes qualificados',
  });

  assert.ok(script.title.includes('Agentes de IA'));
  assert.ok(script.hook0to3s.includes('Falta de clientes qualificados'));
  assert.equal(script.visualDirections.length, 4);
});
