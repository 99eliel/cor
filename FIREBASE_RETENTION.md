# Retenção e custo do Firebase

A arquitetura do sistema separa arquivos permanentes de arquivos temporários para evitar crescimento infinito do Storage.

## Permanentes

- `garments/`: imagens-base das peças do catálogo.
- `logo-assets/`: biblioteca deduplicada de logos e PDFs. O mesmo arquivo é salvo apenas uma vez, identificado por SHA-256.
- `customers/`: cadastro enxuto do cliente e snapshot leve do último pedido.

## Retenção de 90 dias

- `orders`: todo pedido novo recebe o campo `expireAt` com 90 dias de validade.
- `final-renders/`: artes finais do pedido recebem metadata `retention=90-days` e devem ser removidas por lifecycle do bucket.

### Firestore

No Firebase Console, habilitar TTL para a collection group `orders` usando o campo `expireAt`.

### Cloud Storage

Aplicar o arquivo `storage-lifecycle.json` ao bucket `personalizamartinpel.firebasestorage.app`. A regra remove somente objetos de `final-renders/` com mais de 90 dias. A biblioteca deduplicada de logos não é apagada, pois serve para pedidos futuros sem novos uploads.

## Estratégias de economia já aplicadas

- Catálogo em cache por 5 minutos no navegador.
- Pedidos limitados aos 80 registros mais recentes e cacheados por curto período.
- Cliente localizado por hash do WhatsApp em leitura direta de documento, sem query de coleção.
- Logo/PDF deduplicados por hash SHA-256: uma leitura direta verifica se o arquivo já existe antes de qualquer upload.
- Ficha técnica e QR são gerados localmente e não ocupam Storage.
- Artes finais são convertidas para WEBP quando isso realmente reduz o tamanho; o PNG continua sendo usado como fallback.
- Histórico de versão guarda somente dados de design, não cópias adicionais da imagem final.
