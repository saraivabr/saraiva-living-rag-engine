# Relatório de validação — Motor de Vendas no WhatsApp

## Versão ElevenLabs

- Vídeo final: `renders/video-elevenlabs-saraiva-final.mp4`
- Voz: clone autorizado `Saraiva`, da conta ElevenLabs do usuário
- Modelo: Eleven Multilingual v2
- Duração: 75,8 segundos
- Narração efetiva: 69,8 segundos, com pausas visuais e hold final do CTA
- Legendas: 80 grupos construídos a partir dos timestamps nativos da voz
- Hash SHA-256: `d7c72b8dc9b01ea9be59f9655888214b2bcab8a93bf31e363c608ce0bc31c658`

## Entrega

- Formato: 1920 × 1080, 16:9
- Taxa de quadros: 30 fps constante
- Vídeo: H.264, pixel format `yuv420p`, SAR 1:1, DAR 16:9
- Áudio: AAC, 48 kHz, estéreo
- Narração: português brasileiro
- Estrutura: 8 cenas

## Conteúdo comercial validado

- Diferencia claramente “criar um site” de “ter um motor de vendas”.
- Demonstra o fluxo Google Maps + Apify → briefing → prompt para ChatGPT Work + @Sites.
- Explica o apoio para abordagem, preço, proposta, contrato, pagamento e entrega.
- Apresenta as opções de R$ 99 à vista e R$ 49,90 por mês.
- Não inventa clientes, faturamento, avaliações ou garantia de resultado.
- Recursos ainda em evolução são apresentados como evolução, não como disponíveis.

## Verificações

- HyperFrames `lint`: aprovado, sem erros.
- HyperFrames `check`: aprovado.
- Runtime: 0 erros.
- Layout: 0 erros.
- Motion: 0 erros.
- Contraste: sem erro bloqueador.
- Decodificação integral do MP4: aprovada.
- Contact sheet: revisada visualmente.
- HyperFrames atualizado de 0.7.79 para 0.7.80 e verificado após a atualização.

## Observação sobre o validador de Reels

O `validate_reel.py` disponível no projeto é fixo para entregas verticais 9:16 e,
por isso, sinaliza apenas a orientação 1920 × 1080. Essa divergência é esperada:
o vídeo foi solicitado e produzido em 16:9. As demais verificações técnicas foram
aprovadas, e o formato horizontal foi confirmado pelo `ffprobe`.
