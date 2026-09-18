import { useRef, useState } from 'react';
import CustomerStage from './CustomerStage';
import { renderPdfLogoPreview } from '../lib/pdfLogoPreview';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_TYPES.has(file.type)) {
      reject(new Error('Use uma logo PNG, JPG ou WebP.'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error('A logo de teste deve ter no máximo 5 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler a logo selecionada.'));
    reader.readAsDataURL(file);
  });
}

export default function AdminLogoTester({
  garment,
  view,
  colorChoices,
  zoom,
  setZoom,
  onRegionClick,
}) {
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const panRef = useRef(null);
  const [logos, setLogos] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isPanning, setIsPanning] = useState(false);

  async function handleLogoFile(file) {
    if (!file) return;
    setError('');
    setInfo('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        if (file.size > MAX_PDF_BYTES) {
          throw new Error('O PDF de teste deve ter no máximo 15 MB.');
        }

        const { previewFile, pageCount, pageNumber } = await renderPdfLogoPreview(file, 1);
        const dataUrl = await fileToDataUrl(previewFile);

        await stageRef.current?.addLogo(dataUrl, {
          sourceName: file.name,
          sourceType: 'pdf',
          sourcePage: pageNumber,
          sourcePageCount: pageCount,
        });

        setInfo(
          pageCount > 1
            ? `PDF carregado para teste. Exibindo a página 1 de ${pageCount}; o arquivo original não é salvo neste modo.`
            : 'PDF vetorial carregado para teste. O arquivo original não é salvo neste modo.',
        );
      } else {
        const dataUrl = await fileToDataUrl(file);
        await stageRef.current?.addLogo(dataUrl, {
          sourceName: file.name,
          sourceType: 'image',
        });
        setInfo('Logo carregada para teste.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeSelectedLogo() {
    const removed = stageRef.current?.removeSelectedLogo();
    if (!removed) setError('Clique primeiro em uma logo para removê-la.');
    else {
      setError('');
      setInfo('Logo de teste removida.');
    }
  }

  function handleWheel(event) {
    event.preventDefault();
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    setZoom((value) => Math.min(3, Math.max(0.5, Number((value + step).toFixed(2)))));
  }

  function handlePointerDownCapture(event) {
    if (event.button !== 2) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    event.preventDefault();
    event.stopPropagation();
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMoveCapture(event) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    event.preventDefault();
    event.stopPropagation();
    scroller.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX);
    scroller.scrollTop = pan.scrollTop - (event.clientY - pan.clientY);
  }

  function handlePointerEndCapture(event) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    panRef.current = null;
    setIsPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div className="admin-logo-tester">
      <div className="admin-logo-test-actions">
        <div>
          <strong>Teste de logos</strong>
          <span>Use PNG, JPG, WEBP ou PDF vetorial. As logos adicionadas aqui são temporárias e não são salvas na peça.</span>
        </div>
        <div className="inline-actions admin-logo-buttons">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
            onChange={(event) => handleLogoFile(event.target.files?.[0])}
          />
          <button className="button button-primary" type="button" onClick={() => fileInputRef.current?.click()}>
            + Adicionar logo de teste
          </button>
          <button className="button button-secondary" type="button" onClick={removeSelectedLogo} disabled={logos.length === 0}>
            Remover selecionada
          </button>
          <span className="admin-logo-count">{logos.length} logo(s)</span>
        </div>
      </div>

      {error && <div className="inline-error admin-logo-error">{error}</div>}
      {!error && info && <div className="admin-logo-info">{info}</div>}

      <div
        ref={scrollRef}
        className={`editor-scroll admin-logo-test-scroll ${isPanning ? 'is-panning' : ''}`}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDownCapture={handlePointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerUpCapture={handlePointerEndCapture}
        onPointerCancelCapture={handlePointerEndCapture}
      >
        <div className="editor-zoom-stage admin-logo-test-stage" style={{ width: `${zoom * 100}%` }}>
          <CustomerStage
            ref={stageRef}
            garment={garment}
            view={view}
            colorChoices={colorChoices}
            onRegionClick={onRegionClick}
            onLogosChange={setLogos}
          />
        </div>
        <div className="canvas-hint">Arraste, redimensione e gire a logo. Scroll dá zoom. Botão direito + arrastar move a imagem.</div>
      </div>
    </div>
  );
}
