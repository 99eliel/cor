import { useEffect, useState } from 'react';

const LABELS = {
  'split-2': ['Frente', 'Costas'],
  'split-4': ['Frente', 'Costas', 'Lateral esquerda', 'Lateral direita'],
};

function splitDrawing(source, mode = 'split-4') {
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
        const cuts = mode === 'split-2'
          ? [
            [0, 0, halfW, height],
            [halfW, 0, width - halfW, height],
          ]
          : [
            [0, 0, halfW, halfH],
            [halfW, 0, width - halfW, halfH],
            [0, halfH, halfW, height - halfH],
            [halfW, halfH, width - halfW, height - halfH],
          ];

        const results = cuts.map(([sx, sy, sw, sh]) => {
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

export default function TechnicalSplitDrawing({ src, mode = 'split-4' }) {
  const [parts, setParts] = useState([]);

  useEffect(() => {
    let active = true;
    setParts([]);
    splitDrawing(src, mode).then((result) => {
      if (active) setParts(result);
    });
    return () => { active = false; };
  }, [src, mode]);

  if (!parts.length) return null;

  return (
    <div className={`technical-sheet-split-grid is-${mode}`}>
      {parts.map((part, index) => (
        <figure key={(LABELS[mode] || LABELS['split-4'])[index]}>
          <img src={part} alt={(LABELS[mode] || LABELS['split-4'])[index]} />
          <figcaption>{(LABELS[mode] || LABELS['split-4'])[index]}</figcaption>
        </figure>
      ))}
    </div>
  );
}
