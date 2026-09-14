# Customizador de Uniformes

Aplicação React + Vite para cadastro e customização visual de peças de uniforme, preparada para hospedagem estática no GitHub Pages.

## Stack

- React + Vite
- React Router com `HashRouter`
- Fabric.js para logos
- Firebase Firestore e Storage
- Canvas 2D para regiões e recolorização

## Rotas

- `#/admin` — painel interno de cadastro das peças
- `#/customizar/:garmentId` — customizador do cliente
- `#/` — entrada do customizador sem peça selecionada

## Configuração do Firebase

Copie `.env.example` para `.env` e preencha:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Desenvolvimento

```bash
npm install
npm run dev
```

## Deploy GitHub Pages

O Vite está configurado com `base: '/cor/'`.

```bash
npm run deploy
```

O script executa o build e publica a pasta `dist` usando `gh-pages`.

## Decisões pendentes antes das regras de segurança

- Definir se `/admin` usará Firebase Auth.
- Definir se cada peça aceitará uma única logo ou múltiplas logos.
- Informar a escala aproximada de peças/regiões para validar eventuais otimizações de hit-testing.

As regras definitivas de Firestore e Storage devem ser adicionadas depois dessas decisões, sem depender de URL secreta para proteger escrita administrativa.
