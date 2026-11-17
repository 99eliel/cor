import { useEffect, useState } from 'react';

function cropTransparentMargins(source) {
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

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);

        const { data } = ctx.getImageData(0, 0, width, height);
        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const alpha = data[((y * width) + x) * 4 + 3];
            if (alpha <= 12) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (maxX < minX || maxY < minY) return resolve(source);

        const contentWidth = maxX - minX + 1;
        const contentHeight = maxY - minY + 1;
        const marginX = Math.max(2, Math.round(contentWidth * 0.06));
        const marginY = Math.max(2, Math.round(contentHeight * 0.06));
        const cropX = Math.max(0, minX - marginX);
        const cropY = Math.max(0, minY - marginY);
        const cropWidth = Math.min(width - cropX, contentWidth + (marginX * 2));
        const cropHeight = Math.min(height - cropY, contentHeight + (marginY * 2));

        // If there is practically no transparent margin, keep the original URL.
        if (cropWidth >= width * 0.94 && cropHeight >= height * 0.94) return resolve(source);

        const output = document.createElement('canvas');
        output.width = cropWidth;
        output.height = cropHeight;
        const outCtx = output.getContext('2d');
        if (!outCtx) return resolve(source);

        outCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        resolve(output.toDataURL('image/png'));
      } catch {
        resolve(source);
      }
    };

    image.onerror = () => resolve(source);
    image.src = source;
  });
}

export default function TechnicalLogoPreview({ src, alt }) {
  const [displaySrc, setDisplaySrc] = useState(src);

  useEffect(() => {
    let active = true;
    setDisplaySrc(src);
    cropTransparentMargins(src).then((cropped) => {
      if (active && cropped) setDisplaySrc(cropped);
    });
    return () => { active = false; };
  }, [src]);

  return <img src={displaySrc || src} alt={alt} />;
}
