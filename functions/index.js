import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

initializeApp();

const REMOVE_BG_API_KEY = defineSecret('REMOVE_BG_API_KEY');

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || '';
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const removeBackground = onRequest(
  {
    region: 'us-central1',
    cors: [
      'https://99eliel.github.io',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    secrets: [REMOVE_BG_API_KEY],
    memory: '512MiB',
    timeoutSeconds: 90,
    maxInstances: 5,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Método não permitido.' });
      return;
    }

    try {
      const token = bearerToken(req);
      if (!token) {
        res.status(401).json({ error: 'Sessão inválida.' });
        return;
      }

      await getAuth().verifyIdToken(token);

      const { imageUrl, imageBase64, fileName = 'logo.png' } = req.body || {};
      if (!imageUrl && !imageBase64) {
        res.status(400).json({ error: 'Envie uma imagem para remover o fundo.' });
        return;
      }

      if (imageUrl && !validHttpsUrl(imageUrl)) {
        res.status(400).json({ error: 'A URL da imagem é inválida.' });
        return;
      }

      if (imageBase64 && String(imageBase64).length > 30_000_000) {
        res.status(413).json({ error: 'A imagem é grande demais para processamento.' });
        return;
      }

      const form = new FormData();
      if (imageUrl) form.append('image_url', imageUrl);
      else form.append('image_file_b64', String(imageBase64));

      form.append('image_filename', String(fileName).slice(0, 180));
      form.append('size', 'preview');
      form.append('format', 'png');

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': REMOVE_BG_API_KEY.value(),
        },
        body: form,
      });

      if (!response.ok) {
        const details = await response.text();
        console.error('remove.bg error', response.status, details);

        let message = 'O serviço de remoção de fundo não conseguiu processar esta imagem.';
        if (response.status === 402) message = 'O limite gratuito da remoção de fundo foi atingido.';
        if (response.status === 429) message = 'Muitas remoções em sequência. Tente novamente em instantes.';
        if (response.status === 400) message = 'A imagem enviada não pôde ser processada pelo removedor de fundo.';

        res.status(response.status).json({ error: message });
        return;
      }

      const output = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(output);
    } catch (error) {
      console.error('removeBackground', error);
      res.status(500).json({ error: 'Não foi possível concluir a remoção de fundo.' });
    }
  },
);
