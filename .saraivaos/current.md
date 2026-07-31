# SaraivaOS — Estado atual

Atualizado em: 2026-07-31T18:39:39.497Z

## Projeto

- Nome: Motor de Vendas Saraiva.ai
- Objetivo: Publicar VSL e validar funil automático até pagamento e entrega
- Etapa: validacao
- Rota: Instagram Reel sites -> Zernio -> ElevenLabs -> WhatsApp
- Próximo artefato: proof da primeira jornada real nova
- Bloqueio: Nenhum

## Evidências

- Observadas: 22
- Fornecidas: 1
- Inferidas: 0
- Hipóteses: 0
- Desconhecidas: 0

## Métodos ativos

- Zernio
- CloudWatch
- DynamoDB
- ElevenLabs

## Ações pendentes

- [ ] Acompanhar os primeiros dados do novo Reel e do checkout — responsável: SaraivaOS — prazo: não definido — métrica: visitas na loja, cobrancas iniciadas, Pix confirmados e prompts gerados
- [ ] Medir a conversao da oferta unica Sistema Cliente Pronto — responsável: SaraivaOS — prazo: não definido — métrica: visitas, checkouts iniciados, Pix confirmados e dossies gerados
- [ ] Construir prototipo Manifest V3 da Fase 0 com painel lateral e envio assistido no WhatsApp Web — responsável: SaraivaOS — prazo: 2026-08-05 — métrica: 10 negocios testados, 9 dossies corretos e zero envio duplicado ou sem clique
- [ ] Instalar o prototipo em perfil controlado e enviar para numero proprio — responsável: SaraivaOS — prazo: 2026-07-30 — métrica: zero duplicidade, destinatario correto e status reconciliado
- [ ] Medir primeira venda da Extensao Cliente Pronto no novo funil — responsável: SaraivaOS — prazo: 2026-07-31 — métrica: visitas, checkouts iniciados, Pix confirmados, downloads e primeiro cliente gerado
- [ ] Executar proof pack real em staging sem ativação pública — responsável: Saraiva — prazo: não definido — métrica: 1 jornada allowlisted por ramo com IDs Meta, MP3, webhook Woovi e estado de acesso reconciliados
- [ ] Validar a primeira jornada real nova do Reel de sites até a abertura do convite — responsável: SaraivaOS — prazo: 2026-08-01 — métrica: comment_received, private_reply, site_creation_confirmed, audio_sent, community_cta_sent, whatsapp_community_opened separados

## Experimentos ativos

- exp-20260729170721-750e63e9: Extensao Chrome Cliente Pronto - Fase 0 — métrica: usuarios que concluem o fluxo e preferem a extensao ao processo atual

## Artefatos

- video: videos/motor-vendas-whatsapp-vsl/renders/video-elevenlabs-saraiva-final.mp4 — prova: sha256:d7c72b8dc9b01ea9be59f9655888214b2bcab8a93bf31e363c608ce0bc31c658
- copy: videos/motor-vendas-whatsapp-vsl/POST_CAPTION.md — prova: caption published with R, R,90 and loja.saraiva.ai
- copy: videos/motor-vendas-whatsapp-vsl/POST_CAPTION.md — prova: caption published with R$99, R$49,90 and loja.saraiva.ai
- site: storefront/app/page.tsx — prova: Sites v13 commit 0e119c9c3c8ae3567864c9ffc4012861f7953913 em producao
- system: src/automation/sitePromptAutomation.ts — prova: gera diagnostico, 3 abordagens, oferta, proposta, contrato-base, prompt e checklist
- blueprint: docs/plano-extensao-chrome-cliente-pronto.md — prova: arquivo inspecionado com 400 linhas, arquitetura, roadmap, riscos, fontes e experimento
- chrome-extension: chrome-extension/output/cliente-pronto-chrome-v0.1.0.zip — prova: sha256:8ace2f5a0a2760dd13372c9e3558735dba22ee5beb834988e5567166561019d8
- chrome-extension-final: chrome-extension/output/cliente-pronto-chrome-v0.1.0.zip — prova: sha256:492083bed927a976b3607d5fbae7bdad456b258a3abecbd7daab0c7aee4447ff
- chrome-extension-commercial: chrome-extension/output/cliente-pronto-chrome-v0.1.0.zip — prova: sha256:454ac97e7b48beb67e59ff9790638326cd929a1fd94495bc932a0505ba91c405; download pago comparado byte a byte
- storefront: storefront/app/page.tsx — prova: Sites v19 commit 4608b5fa39dc65c3b3d34ee7f32af629bf37981b em producao no loja.saraiva.ai
- storefront: storefront/app/page.tsx — prova: Sites v20 commit 3f33347e3cbee70ae1e0c1e9c9f2c807ecfb7427 em producao no loja.saraiva.ai
- chrome-extension-commercial: chrome-extension/output/cliente-pronto-chrome-v0.1.0.zip — prova: sha256:12dad1ca1335e990e166100b268ac460c92fffb9f110310d93b82e8e3d382be1; pacote pago verificado byte a byte
- proof-plan: /Users/saraiva/_Projetos/respondedorinstagram/docs/sexyflow-staging-proof.md — prova: Fluxograma, razão observável, gates, proof pack, rollback e bloqueio explícito de produção.
- proof-pack: docs/automation-runs/2026-07-31T18-38Z-sites-live.md — prova: Lambda v19; code hash PUk8Z8Dhlq5VFyzZRKjtjLXRF2YQ6zQrBk7auhQ9ZHk=; 147/147 testes; HTTP 403/200

## Aprendizados recentes

- A API Woovi rejeita travessao no campo comment como emoji; usar comentario ASCII para cobrancas. — evidência: erro real woovi_charge_failed_400 em 2026-07-29 e reteste HTTP 200
- Uma oferta low-ticket fica clara quando define a unidade de entrega: uma empresa entra e um dossie completo sai; o PDF deve aparecer apenas como bonus. — evidência: site publico e checkout R,90 validados em producao
- Uma oferta low-ticket fica clara quando define a unidade de entrega: uma empresa entra e um dossie completo sai; o PDF deve aparecer apenas como bonus. — evidência: site publico e checkout de R$19,90 validados em producao
- Para a oferta low-ticket atual, a unidade de valor mais compreensivel e uma rodada de 10 prospeccoes completas, com extensao e processo comercial, por um unico pagamento. — evidência: site, checkout, backend, painel e entrega alinhados em producao
