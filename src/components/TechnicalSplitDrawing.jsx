import { useEffect, useState } from 'react';

const LABELS = ['Frente', 'Costas', 'Lateral esquerda', 'Lateral direita'];

function splitIntoQuadrants(source) {
  return new Promise((resolve) => {
    if (!source) return resolve([]);

    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) return resolve([]);

        const halfW = Math.floor(width / 2);
        const halfH = Math.floor(height / 2);
        const quadrants = [
          [0, 0, halfW, halfH],
          [halfW, 0, width - halfW, halfH],
          [0, halfH, halfW, height - halfH],
          [halfW, halfH, width - halfW, height - halfH],
        ];

        const results = quadrants.map(([sx, sy, sw, sh]) => {
          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d');
          if (!ctx) return source;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
          return canvas.toDataURL('image/png');
        });

        resolve(results);
      } catch {
        resolve([]);
      }
    };

    image.onerror = () => resolve([]);
    image.src = source;
  });
}

export default function TechnicalSplitDrawing({ src }) {
  const [parts, setParts] = useState([]);

  useEffect(() => {
    let active = true;
    setParts([]);
    splitIntoQuadrants(src).then((result) => {
      if (active) setParts(result);
    });
    return () => { active = false; };
  }, [src]);

  if (!parts.length) return null;

  return (
    <div className="technical-sheet-split-grid">
      {parts.map((part, index) => (
        <figure key={LABELS[index]}>
          <img src={part} alt={LABELS[index]} />
          <figcaption>{LABELS[index]}</figcaption>
        </figure>
      ))}
    </div>
  );
}
