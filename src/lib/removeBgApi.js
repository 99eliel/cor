const ENDPOINT = '/api/remove-background';

async function readError(response) {
  try {
    const payload = await response.json();
    return payload?.error || 'Não foi possível remover o fundo com remove.bg.';
  } catch {
    try {
      const text = await response.text();
      return text || 'Não foi possível remover o fundo com remove.bg.';
    } catch {
      return 'Não foi possível remover o fundo com remove.bg.';
    }
  }
}

export async function removeBackgroundWithRemoveBg(source) {
  if (!source) throw new Error('Logo inválida.');

  const sourceResponse = await fetch(source, { cache: 'no-store' });
  if (!sourceResponse.ok) throw new Error('Não foi possível carregar a logo selecionada.');
  const inputBlob = await sourceResponse.blob();

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(inputBlob.type)) {
    throw new Error('O remove.bg aceita nesta tela apenas PNG, JPG ou WEBP.');
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': inputBlob.type,
      'X-Source-Name': 'martinpel-logo',
    },
    body: inputBlob,
  });

  if (!response.ok) {
    const message = await readError(response);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  if (!blob?.size) throw new Error('O remove.bg retornou uma imagem vazia.');

  return {
    blob,
    creditsCharged: response.headers.get('x-removebg-credits-charged') || '',
    detectedType: response.headers.get('x-removebg-type') || '',
  };
}
