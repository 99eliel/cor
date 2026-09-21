import { auth } from './firebase';

const DEFAULT_ENDPOINT = 'https://us-central1-personalizamartinpel.cloudfunctions.net/removeBackground';
const ENDPOINT = import.meta.env.VITE_REMOVE_BG_FUNCTION_URL || DEFAULT_ENDPOINT;

function dataUrlPayload(value) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(value || '');
  if (!match) return null;
  return {
    mimeType: match[1] || 'image/png',
    imageBase64: match[2],
  };
}

async function errorMessage(response) {
  try {
    const data = await response.json();
    return data?.error || data?.message || '';
  } catch {
    return '';
  }
}

export async function removeLogoBackground(source, fileName = 'logo.png') {
  const user = auth.currentUser;
  if (!user) throw new Error('A sessão expirou. Recarregue a página e tente novamente.');

  const token = await user.getIdToken();
  const dataUrl = dataUrlPayload(source);
  const body = dataUrl
    ? { imageBase64: dataUrl.imageBase64, mimeType: dataUrl.mimeType, fileName }
    : { imageUrl: source, fileName };

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('A ferramenta de remoção de fundo ainda não está disponível no servidor.');
  }

  if (!response.ok) {
    const detail = await errorMessage(response);
    throw new Error(detail || 'Não foi possível remover o fundo desta imagem.');
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('O serviço não retornou uma imagem válida.');
  }
  return blob;
}

export function backgroundRemovedFile(blob, originalName = 'logo') {
  const base = String(originalName)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_') || 'logo';
  return new File([blob], `${base}-sem-fundo.png`, { type: 'image/png' });
}
