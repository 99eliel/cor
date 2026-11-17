const ENDPOINT = '/api/remove-background';
const CACHE_NAME = 'martinpel-removebg-v2-hq';

function loadBlobImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível preparar a imagem em alta qualidade.'));
    };
    image.src = url;
  });
}

async function preserveOriginalDetailWithMask(inputBlob, cutoutBlob, maxSide = 4096) {
  const [sourceLoaded, maskLoaded] = await Promise.all([
    loadBlobImage(inputBlob),
    loadBlobImage(cutoutBlob),
  ]);

  try {
    const source = sourceLoaded.image;
    const mask = maskLoaded.image;
    const sourceWidth = source.naturalWidth || source.width || 1;
    const sourceHeight = source.naturalHeight || source.height || 1;
    const longestSide = Math.max(sourceWidth, sourceHeight);
    const ratio = Math.min(1, maxSide / longestSide);
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));

    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outCtx = output.getContext('2d', { willReadFrequently: true });
    if (!outCtx) return cutoutBlob;

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.clearRect(0, 0, width, height);
    outCtx.drawImage(source, 0, 0, width, height);
    const sourceData = outCtx.getImageData(0, 0, width, height);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskCtx) return cutoutBlob;

    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = 'high';
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.drawImage(mask, 0, 0, width, height);
    const maskData = maskCtx.getImageData(0, 0, width, height).data;

    for (let i = 0; i < sourceData.data.length; i += 4) {
      sourceData.data[i + 3] = Math.min(sourceData.data[i + 3], maskData[i + 3]);
    }

    outCtx.putImageData(sourceData, 0, 0);

    return await new Promise((resolve) => {
      output.toBlob((blob) => resolve(blob || cutoutBlob), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(sourceLoaded.url);
    URL.revokeObjectURL(maskLoaded.url);
  }
}

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

async function shortHash(value) {
  if (!globalThis.crypto?.subtle) return encodeURIComponent(String(value)).slice(0, 120);
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function cacheRequestFor(key) {
  const hash = await shortHash(key);
  return new Request(`${location.origin}/__removebg-cache__/${hash}`);
}

async function readCachedResult(key) {
  if (!('caches' in window) || !key) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const request = await cacheRequestFor(key);
    const response = await cache.match(request);
    if (!response) return null;
    const blob = await response.blob();
    if (!blob?.size) return null;
    return {
      blob,
      creditsCharged: '0',
      detectedType: response.headers.get('x-removebg-type') || '',
      cached: true,
    };
  } catch {
    return null;
  }
}

async function cacheResult(key, blob, metadata = {}) {
  if (!('caches' in window) || !key || !blob?.size) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const request = await cacheRequestFor(key);
    const response = new Response(blob, {
      headers: {
        'Content-Type': 'image/png',
        'X-Removebg-Type': metadata.detectedType || '',
        'Cache-Control': 'public, max-age=2592000',
      },
    });
    await cache.put(request, response);
  } catch {
    // Cache é apenas uma otimização. Falhas não impedem a remoção.
  }
}

export async function removeBackgroundWithRemoveBg(source, options = {}) {
  if (!source) throw new Error('Logo inválida.');

  const cacheKey = options.cacheKey || source;
  const cached = await readCachedResult(cacheKey);
  if (cached) return cached;

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

  // O plano preview pode devolver uma máscara em baixa resolução.
  // Reaplicamos essa transparência sobre o arquivo original em até 4096 px,
  // preservando o detalhe real da logo em vez de ampliar pixels do preview.
  const highQualityBlob = await preserveOriginalDetailWithMask(inputBlob, blob);

  const result = {
    blob: highQualityBlob,
    creditsCharged: response.headers.get('x-removebg-credits-charged') || '',
    detectedType: response.headers.get('x-removebg-type') || '',
    cached: false,
  };

  await cacheResult(cacheKey, highQualityBlob, result);
  return result;
}
