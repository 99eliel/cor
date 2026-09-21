# Ativação da remoção de fundo

A ferramenta usa a API do remove.bg por uma Firebase Function para que a chave nunca fique exposta no GitHub Pages.

## 1. Criar a chave

No remove.bg, crie uma API Key em **My Account → API Keys**.

## 2. Gravar a chave como secret

Na raiz do projeto:

```bash
firebase functions:secrets:set REMOVE_BG_API_KEY
```

Cole a chave quando a CLI solicitar.

## 3. Instalar as dependências da Function

```bash
cd functions
npm install
cd ..
```

## 4. Implantar somente a Function

```bash
firebase deploy --only functions:removeBackground
```

A Function usa a região `us-central1`. O frontend já possui como endereço padrão:

```
https://us-central1-app-da-cidade-7759b.cloudfunctions.net/removeBackground
```

Se o endereço mudar, configure `VITE_REMOVE_BG_FUNCTION_URL` no build do frontend.

## Segurança

- A chave do remove.bg fica no Secret Manager.
- A Function exige um Firebase ID Token válido.
- O original da logo não é apagado.
- A versão sem fundo é salva separadamente.
- Para os testes gratuitos, a Function solicita saída `preview`.
