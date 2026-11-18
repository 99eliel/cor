const BLOCKS = [
  { id: 'header', label: 'Cabeçalho / dados da peça' },
  { id: 'drawing', label: 'Desenho técnico' },
  { id: 'logos', label: 'Logos e detalhes' },
  { id: 'measurements', label: 'Tabela de medidas' },
];

export const TECHNICAL_SHEET_PRESETS = {
  compact: {
    preset: 'compact',
    blocks: [
      { id: 'header', visible: true, size: 'small', breakBefore: false },
      { id: 'drawing', visible: true, size: 'medium', breakBefore: false },
      { id: 'logos', visible: true, size: 'small', breakBefore: false },
      { id: 'measurements', visible: true, size: 'medium', breakBefore: false },
    ],
  },
  standard: {
    preset: 'standard',
    blocks: [
      { id: 'header', visible: true, size: 'medium', breakBefore: false },
      { id: 'drawing', visible: true, size: 'large', breakBefore: false },
      { id: 'logos', visible: true, size: 'medium', breakBefore: true },
      { id: 'measurements', visible: true, size: 'medium', breakBefore: false },
    ],
  },
  detailed: {
    preset: 'detailed',
    blocks: [
      { id: 'header', visible: true, size: 'medium', breakBefore: false },
      { id: 'drawing', visible: true, size: 'full', breakBefore: false },
      { id: 'logos', visible: true, size: 'large', breakBefore: true },
      { id: 'measurements', visible: true, size: 'large', breakBefore: true },
    ],
  },
};

export function normalizeTechnicalSheetLayout(value) {
  const source = value && typeof value === 'object' ? value : TECHNICAL_SHEET_PRESETS.standard;
  const incoming = Array.isArray(source.blocks) ? source.blocks : [];
  const normalized = [];
  const used = new Set();

  incoming.forEach((item) => {
    if (!BLOCKS.some((block) => block.id === item?.id) || used.has(item.id)) return;
    used.add(item.id);
    normalized.push({
      id: item.id,
      visible: item.visible !== false,
      size: ['small', 'medium', 'large', 'full'].includes(item.size) ? item.size : 'medium',
      breakBefore: Boolean(item.breakBefore),
    });
  });

  BLOCKS.forEach((block) => {
    if (!used.has(block.id)) {
      normalized.push({ id: block.id, visible: true, size: block.id === 'drawing' ? 'large' : 'medium', breakBefore: false });
    }
  });

  return {
    preset: ['compact', 'standard', 'detailed', 'custom'].includes(source.preset) ? source.preset : 'custom',
    blocks: normalized,
  };
}

export default function TechnicalSheetLayoutEditor({ value, onChange, hasLogos = true }) {
  const layout = normalizeTechnicalSheetLayout(value);

  function applyPreset(name) {
    onChange?.(normalizeTechnicalSheetLayout(TECHNICAL_SHEET_PRESETS[name]));
  }

  function updateBlock(id, patch) {
    onChange?.({
      preset: 'custom',
      blocks: layout.blocks.map((block) => block.id === id ? { ...block, ...patch } : block),
    });
  }

  function move(id, direction) {
    const index = layout.blocks.findIndex((block) => block.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= layout.blocks.length) return;
    const blocks = [...layout.blocks];
    const [item] = blocks.splice(index, 1);
    blocks.splice(nextIndex, 0, item);
    onChange?.({ preset: 'custom', blocks });
  }

  return (
    <section className="technical-layout-editor no-print">
      <div className="technical-layout-editor-head">
        <div>
          <span>Organizador da ficha</span>
          <strong>Monte o PDF deste pedido</strong>
          <small>Escolha um modelo pronto ou ajuste cada bloco. A configuração fica salva neste pedido.</small>
        </div>
        <div className="technical-layout-presets">
          {[
            ['compact', 'Compacta'],
            ['standard', 'Padrão'],
            ['detailed', 'Detalhada'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={layout.preset === id ? 'active' : ''}
              onClick={() => applyPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="technical-layout-blocks">
        {layout.blocks.map((block, index) => {
          const meta = BLOCKS.find((item) => item.id === block.id);
          const unavailable = block.id === 'logos' && !hasLogos;
          return (
            <div className={`technical-layout-block ${unavailable ? 'is-unavailable' : ''}`} key={block.id}>
              <div className="technical-layout-block-main">
                <strong>{meta?.label || block.id}</strong>
                {unavailable && <small>Este pedido não possui logos separadas.</small>}
              </div>

              <label>
                <span>Mostrar</span>
                <input
                  type="checkbox"
                  checked={block.visible && !unavailable}
                  disabled={unavailable}
                  onChange={(event) => updateBlock(block.id, { visible: event.target.checked })}
                />
              </label>

              <label>
                <span>Tamanho</span>
                <select
                  value={block.size}
                  disabled={unavailable || !block.visible}
                  onChange={(event) => updateBlock(block.id, { size: event.target.value })}
                >
                  <option value="small">Pequeno</option>
                  <option value="medium">Médio</option>
                  <option value="large">Grande</option>
                  <option value="full">Página inteira</option>
                </select>
              </label>

              <label>
                <span>Nova página antes</span>
                <input
                  type="checkbox"
                  checked={block.breakBefore}
                  disabled={unavailable || !block.visible || index === 0}
                  onChange={(event) => updateBlock(block.id, { breakBefore: event.target.checked })}
                />
              </label>

              <div className="technical-layout-order">
                <button type="button" title="Mover para cima" disabled={index === 0} onClick={() => move(block.id, -1)}>↑</button>
                <button type="button" title="Mover para baixo" disabled={index === layout.blocks.length - 1} onClick={() => move(block.id, 1)}>↓</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
