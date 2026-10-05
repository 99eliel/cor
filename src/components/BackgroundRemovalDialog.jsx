import { useEffect, useMemo, useState } from 'react';
import {
  colorToCss,
  prepareBackgroundRemoval,
  processBackgroundRemoval,
  samplePreparedColor,
} from '../lib/localBackgroundRemoval';
import '../background-removal-ai.css';

function progressPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric <= 1 ? numeric * 100 : numeric)));
}

export default function BackgroundRemovalDialog({
  open,
  source,
  fileName,
  onCancel,
  onApply,
}) {
  const [prepared, setPrepared] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState(null);
  const [tolerance, setTolerance] = useState(42);
  const [feather, setFeather] = useState(12);
  const [removeInternalIslands, setRemoveInternalIslands] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBlob, setPreviewBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiBlob, setAiBlob] = useState(null);
  const [aiPreviewUrl, setAiPreviewUrl] = useState('');

  const selectedColor = backgroundColor || prepared?.autoColor || null;
  const selectedColorCss = useMemo(() => colorToCss(selectedColor), [selectedColor]);

  useEffect(() => {
    if (!open || !source) return undefined;
    let active = true;
    setLoading(true);
    setPrepared(null);
    setBackgroundColor(null);
    setPreviewBlob(null);
    setError('');
    setAiOpen(false);
    setAiProcessing(false);
    setAiProgress(0);
    setAiMessage('');
    setAiError('');
    setAiBlob(null);
    setAiPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });

    prepareBackgroundRemoval(source)
      .then((next) => {
        if (!active) return;
        setPrepared(next);
        setBackgroundColor(next.autoColor);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, source]);

  useEffect(() => {
    if (!open || !prepared || !selectedColor) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setProcessing(true);
      try {
        const blob = await processBackgroundRemoval(prepared, {
          backgroundColor: selectedColor,
          tolerance,
          feather,
          removeInternalIslands,
        });
        if (!active) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        setError('');
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setProcessing(false);
      }
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, prepared, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, feather, removeInternalIslands]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (aiPreviewUrl) URL.revokeObjectURL(aiPreviewUrl);
  }, [aiPreviewUrl]);

  if (!open) return null;

  function chooseBackground(event) {
    if (!prepared) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setBackgroundColor(samplePreparedColor(prepared, x, y));
  }

  async function apply() {
    if (!previewBlob || processing) return;
    await onApply?.(previewBlob);
  }

  async function runAiRemoval() {
    if (!source || aiProcessing) return;
    setAiProcessing(true);
    setAiProgress(1);
    setAiMessage('Preparando a logo…');
    setAiError('');
    setAiBlob(null);
    setAiPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });

    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error('Não foi possível carregar a logo selecionada.');
      const inputBlob = await response.blob();
      setAiProgress(5);
      setAiMessage('Carregando o modelo de IA…');

      const { removeBackground } = await import('@bg0/browser');
      const result = await removeBackground(inputBlob, {
        quality: 'quality',
        onProgress: ({ progress, message }) => {
          setAiProgress(Math.max(5, progressPercent(progress)));
          if (message) setAiMessage(message);
        },
      });

      if (!result?.blob) throw new Error('A IA não retornou uma imagem válida.');
      const resultUrl = URL.createObjectURL(result.blob);
      setAiBlob(result.blob);
      setAiPreviewUrl(resultUrl);
      setAiProgress(100);
      setAiMessage('Recorte concluído. Confira o resultado antes de aplicar.');
    } catch (err) {
      setAiError(err?.message || 'Não foi possível remover o fundo com IA.');
      setAiMessage('');
    } finally {
      setAiProcessing(false);
    }
  }

  async function applyAi() {
    if (!aiBlob || aiProcessing) return;
    await onApply?.(aiBlob);
  }

  if (aiOpen) {
    return (
      <div className="bg-removal-backdrop bg-ai-backdrop" role="presentation">
        <section className="panel bg-removal-dialog bg-ai-dialog" role="dialog" aria-modal="true" aria-label="Remover logo com IA">
          <div className="bg-removal-head bg-ai-head">
            <div>
              <p className="eyebrow">IA local · sem créditos</p>
              <h2>Remover logo com IA</h2>
              <p>A remoção acontece no próprio navegador. A logo não é enviada para o remove.bg e não consome créditos.</p>
            </div>
            <div className="bg-ai-head-actions">
              <button type="button" className="button button-secondary" onClick={() => setAiOpen(false)} disabled={aiProcessing}>← Voltar ao editor manual</button>
              <button type="button" className="bg-removal-close" onClick={onCancel} disabled={aiProcessing}>×</button>
            </div>
          </div>

          <div className="bg-ai-file-strip">
            <span>Logo selecionada</span>
            <strong>{fileName || 'Logo selecionada'}</strong>
            <small>No primeiro uso, o navegador baixa o modelo da IA. Depois ele fica armazenado em cache para os próximos recortes.</small>
          </div>

          <div className="bg-ai-workspace">
            <div className="bg-ai-preview-card">
              <div className="bg-ai-preview-heading"><strong>Original</strong><span>Imagem atualmente posicionada na peça</span></div>
              <div className="bg-ai-preview checkerboard"><img src={source} alt="Logo original" /></div>
            </div>

            <div className="bg-ai-preview-card">
              <div className="bg-ai-preview-heading"><strong>Resultado da IA</strong><span>{aiBlob ? 'PNG transparente pronto para aplicar' : 'Execute a IA para gerar o recorte'}</span></div>
              <div className="bg-ai-preview checkerboard checkerboard-contrast">
                {aiPreviewUrl ? <img src={aiPreviewUrl} alt="Resultado sem fundo" /> : <div className="bg-ai-placeholder">✦</div>}
              </div>
            </div>
          </div>

          <div className="bg-ai-status-card">
            <div className="bg-ai-status-head">
              <strong>{aiProcessing ? 'Processando com IA…' : aiBlob ? 'Recorte concluído' : 'Pronto para remover o fundo'}</strong>
              <span>{aiProgress}%</span>
            </div>
            <div className="bg-ai-progress"><span style={{ width: `${aiProgress}%` }} /></div>
            <p>{aiMessage || 'Todo o processamento é feito localmente no dispositivo.'}</p>
            {aiError && <div className="inline-error">{aiError}</div>}
          </div>

          <div className="bg-ai-actions">
            <button type="button" className="button button-secondary" onClick={() => setAiOpen(false)} disabled={aiProcessing}>Cancelar IA</button>
            <button type="button" className="button button-primary" onClick={runAiRemoval} disabled={aiProcessing}>
              {aiProcessing ? 'Processando…' : aiBlob ? 'Refazer com IA' : '✦ Remover fundo com IA'}
            </button>
            <button type="button" className="button button-success" onClick={applyAi} disabled={!aiBlob || aiProcessing}>Aplicar resultado</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="bg-removal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !processing) onCancel?.();
    }}>
      <section className="panel bg-removal-dialog" role="dialog" aria-modal="true" aria-label="Remover fundo da logo">
        <div className="bg-removal-head">
          <div>
            <p className="eyebrow">Tratamento da logo</p>
            <h2>Remover fundo da logo</h2>
            <p>Use o ajuste manual para fundos simples ou a IA local para recortes automáticos mais complexos.</p>
          </div>
          <button type="button" className="bg-removal-close" onClick={onCancel} disabled={processing}>×</button>
        </div>

        <div className="bg-ai-launch-card">
          <div>
            <strong>Remoção automática sem créditos</strong>
            <span>A IA roda no próprio navegador, sem abrir outro site e sem consumir plano do remove.bg.</span>
          </div>
          <button type="button" className="button button-primary bg-ai-launch-button" onClick={() => setAiOpen(true)}>
            ✦ Remover logo com IA
          </button>
        </div>

        <div className="bg-removal-file">
          <span>Arquivo</span>
          <strong>{fileName || 'Logo selecionada'}</strong>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {loading && <div className="bg-removal-loading">Preparando imagem…</div>}

        {!loading && prepared && (
          <>
            <div className="bg-removal-preview-grid">
              <div>
                <div className="bg-removal-preview-title">
                  <strong>Original</strong>
                  <span>Clique no fundo para selecionar a cor</span>
                </div>
                <button type="button" className="bg-removal-image checkerboard" onClick={chooseBackground}>
                  <img src={source} alt="Logo original" />
                </button>
              </div>

              <div>
                <div className="bg-removal-preview-title">
                  <strong>Resultado manual</strong>
                  <span>{processing ? 'Atualizando…' : 'Prévia transparente'}</span>
                </div>
                <div className="bg-removal-image checkerboard checkerboard-contrast">
                  {previewUrl ? <img src={previewUrl} alt="Prévia sem fundo" /> : <span>Gerando prévia…</span>}
                </div>
              </div>
            </div>

            <div className="bg-removal-controls">
              <div className="bg-removal-color-row">
                <span>Cor do fundo</span>
                <span className="bg-removal-color-chip" style={{ background: selectedColorCss }} />
                <code>{selectedColorCss}</code>
                <button type="button" className="mini-link" onClick={() => setBackgroundColor(prepared.autoColor)}>Detectar novamente</button>
              </div>

              <label>
                <span>Tolerância <strong>{tolerance}</strong></span>
                <input type="range" min="8" max="110" step="1" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} />
                <small>Aumente se ainda sobrar fundo. Diminua se começar a apagar partes da logo.</small>
              </label>

              <label>
                <span>Suavização da borda <strong>{feather}</strong></span>
                <input type="range" min="0" max="35" step="1" value={feather} onChange={(event) => setFeather(Number(event.target.value))} />
                <small>Suaviza os pixels próximos ao contorno para evitar bordas serrilhadas.</small>
              </label>

              <label className="bg-removal-checkbox">
                <input
                  type="checkbox"
                  checked={removeInternalIslands}
                  onChange={(event) => setRemoveInternalIslands(event.target.checked)}
                />
                <span>
                  <strong>Limpar resíduos internos</strong>
                  <small>Remove pequenos bolsões da cor do fundo presos dentro de letras e símbolos.</small>
                </span>
              </label>
            </div>

            <div className="bg-removal-tip">
              Para logos com fundo irregular, sombras, fotos ou vários tons, use “Remover logo com IA”. Para fundo liso, o modo manual costuma ser mais rápido.
            </div>

            <div className="bg-removal-actions">
              <button type="button" className="button button-secondary" onClick={onCancel} disabled={processing}>Cancelar</button>
              <button type="button" className="button button-primary" onClick={apply} disabled={!previewBlob || processing}>
                {processing ? 'Atualizando…' : 'Aplicar remoção manual'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
