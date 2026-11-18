import { useEffect, useMemo, useState } from 'react';

const MODES = [
  { value: 'original', title: 'Original', description: 'Mantém a imagem exatamente como foi cadastrada.' },
  { value: 'split-2', title: '2 vistas', description: 'Divide verticalmente em Frente e Costas.' },
  { value: 'split-4', title: '4 vistas', description: 'Divide em Frente, Costas, Lateral esquerda e Lateral direita.' },
];

function splitPreview(source, mode) {
  return new Promise((resolve) => {
    if (!source || mode === 'original') return resolve(source ? [source] : []);

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const cuts = mode === 'split-2'
          ? [
            [0, 0, Math.floor(width / 2), height],
            [Math.floor(width / 2), 0, width - Math.floor(width / 2), height],
          ]
          : [
            [0, 0, Math.floor(width / 2), Math.floor(height / 2)],
            [Math.floor(width / 2), 0, width - Math.floor(width / 2), Math.floor(height / 2)],
            [0, Math.floor(height / 2), Math.floor(width / 2), height - Math.floor(height / 2)],
            [Math.floor(width / 2), Math.floor(height / 2), width - Math.floor(width / 2), height - Math.floor(height / 2)],
          ];

        resolve(cuts.map(([sx, sy, sw, sh]) => {
          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d');
          if (!ctx) return source;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
          return canvas.toDataURL('image/png');
        }));
      } catch {
        resolve([source]);
      }
    };
    image.onerror = () => resolve([source]);
    image.src = source;
  });
}

const LABELS = {
  original: ['Imagem original'],
  'split-2': ['Frente', 'Costas'],
  'split-4': ['Frente', 'Costas', 'Lateral esquerda', 'Lateral direita'],
};

export default function GarmentViewOrganizer({ source, value = 'original', onChange }) {
  const [previewMode, setPreviewMode] = useState(value || 'original');
  const [previews, setPreviews] = useState([]);

  useEffect(() => setPreviewMode(value || 'original'), [value]);

  useEffect(() => {
    let active = true;
    splitPreview(source, previewMode).then((items) => {
      if (active) setPreviews(items);
    });
    return () => { active = false; };
  }, [source, previewMode]);

  const labels = useMemo(() => LABELS[previewMode] || LABELS.original, [previewMode]);

  return (
    <section className="panel garment-view-organizer">
      <div className="garment-view-organizer-head">
        <div>
          <p className="eyebrow">Organizador de vistas</p>
          <h3>Como esta imagem foi montada?</h3>
          <p>A imagem original não será alterada. Essa configuração serve para a ficha técnica apresentar cada vista separadamente.</p>
        </div>
      </div>

      {!source ? (
        <div className="garment-view-organizer-empty">Envie ou selecione uma foto da peça para visualizar a organização.</div>
      ) : (
        <>
          <div className="garment-view-mode-grid">
            {MODES.map((mode) => (
              <button
                type="button"
                key={mode.value}
                className={previewMode === mode.value ? 'active' : ''}
                onClick={() => setPreviewMode(mode.value)}
              >
                <strong>{mode.title}</strong>
                <small>{mode.description}</small>
              </button>
            ))}
          </div>

          <div className={`garment-view-preview is-${previewMode}`}>
            {previews.map((url, index) => (
              <figure key={`${previewMode}-${index}`}>
                <img src={url} alt={labels[index] || `Vista ${index + 1}`} />
                <figcaption>{labels[index] || `Vista ${index + 1}`}</figcaption>
              </figure>
            ))}
          </div>

          <button
            className="button button-primary"
            type="button"
            onClick={() => onChange?.(previewMode)}
            disabled={previewMode === value}
          >
            {previewMode === value ? 'Configuração aplicada' : 'Aplicar organização'}
          </button>
        </>
      )}
    </section>
  );
}
