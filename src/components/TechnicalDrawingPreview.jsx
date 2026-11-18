import { useEffect, useState } from 'react';

function colorDistance(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function cropArtworkMargins(source) {
  return new Promise((resolve) => {
    if (!source) return resolve(source);

    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) return resolve(source);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(source);

        ctx.drawImage(image, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const sample = (x, y) => {
          const i = ((y * width) + x) * 4;
          return [data[i], data[i + 1], data[i + 2], data[i + 3]];
        };

        // Usa a média dos quatro cantos como referência do fundo do mockup.
        const corners = [
          sample(0, 0),
          sample(width - 1, 0),
          sample(0, height - 1),
          sample(width - 1, height - 1),
        ];
        const background = [
          Math.round(corners.reduce((sum, c) => sum + c[0], 0) / corners.length),
          Math.round(corners.reduce((sum, c) => sum + c[1], 0) / corners.length),
          Math.round(corners.reduce((sum, c) => sum + c[2], 0) / corners.length),
        ];

        const threshold = 48;
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const i = ((y * width) + x) * 4;
            const alpha = data[i + 3];
            if (alpha <= 12) continue;
            const pixel = [data[i], data[i + 1], data[i + 2]];
            if (colorDistance(pixel, background) <= threshold) continue;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (maxX < minX || maxY < minY) return resolve(source);

        const contentWidth = maxX - minX + 1;
        const contentHeight = maxY - minY + 1;
        const marginX = Math.max(8, Math.round(contentWidth * 0.05));
        const marginY = Math.max(8, Math.round(contentHeight * 0.05));
        const cropX = Math.max(0, minX - marginX);
        const cropY = Math.max(0, minY - marginY);
        const cropWidth = Math.min(width - cropX, contentWidth + (marginX * 2));
        const cropHeight = Math.min(height - cropY, contentHeight + (marginY * 2));

        // Se praticamente não existe margem, mantém a imagem original.
        if (cropWidth >= width * 0.94 && cropHeight >= height * 0.94) return resolve(source);

        const output = document.createElement('canvas');
        output.width = cropWidth;
        output.height = cropHeight;
        const outCtx = output.getContext('2d');
        if (!outCtx) return resolve(source);

        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';
        outCtx.drawImage(
          canvas,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight,
        );

        resolve(output.toDataURL('image/png'));
      } catch {
        resolve(source);
      }
    };

    image.onerror = () => resolve(source);
    image.src = source;
  });
}

export default function TechnicalDrawingPreview({ src, alt }) {
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let active = true;
    setDisplaySrc(src);
    cropArtworkMargins(src).then((cropped) => {
      if (active && cropped) setDisplaySrc(cropped);
    });
    return () => { active = false; };
  }, [src]);

  return <img src={displaySrc || src} alt={alt} />;
}
