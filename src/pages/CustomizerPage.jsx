import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerStage from '../components/CustomerStage';
import MartinpelBrand from '../components/MartinpelBrand';
import PdfLogoPageMapper from '../components/PdfLogoPageMapper';
import { ensureClientUser } from '../lib/clientAuth';
import { getGarment, listGarments } from '../lib/garmentRepo';
import { createOrder } from '../lib/orderRepo';
import { renderPdfLogoPreview, renderPdfLogoPreviews } from '../lib/pdfLogoPreview';
import { uploadClientLogo, uploadClientLogoOriginalPdf, uploadFinalRender } from '../lib/storageImages';
import '../customer.css';

const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

function availableViews(garment) {
  return ['front', 'back', 'combined'].filter((key) => garment?.images?.[key]);
}

function safeFileName(value) {
  return (value || 'uniforme')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'uniforme';
}

function Catalog() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listGarments().then(setItems).catch((err) => setError(err.message));
  }, []);

  return (
    <main className="app-shell catalog-shell">
      <div className="martinpel-appbar customer-brandbar">
        <MartinpelBrand compact subtitle="Uniformes e EPI's personalizados" />
        <Link className="button button-light catalog-admin-link" to="/admin">Área administrativa</Link>
      </div>

      <header className="customer-header catalog-header catalog-hero">
        <div className="catalog-hero-copy">
          <span className="catalog-kicker">Personalização Martinpel</span>
          <h1>Monte seu uniforme do seu jeito.</h1>
          <p>Escolha uma peça, altere as cores, posicione sua marca e envie a solicitação pronta para orçamento e produção.</p>
        </div>
        <div className="catalog-hero-badge">
          <strong>Visualização em tempo real</strong>
          <span>Cores • Logos • Frente e costas</span>
        </div>
      </header>
      {error && <div className="notice notice-error">{error}</div>}
      <section className="catalog-grid">
        {items.map((item) => {
          const thumb = item.images?.front || item.images?.combined || item.images?.back;
          return (
            <Link className="panel catalog-card" key={item.id} to={`/customizar/${item.id}`}>
              <div className="catalog-image-wrap">{thumb ? <img src={thumb} alt={item.name} /> : <span>Sem imagem</span>}</div>
              <div className="catalog-card-body"><strong>{item.name}</strong><span>Personalizar →</span></div>
            </Link>
          );
        })}
        {!error && items.length === 0 && <div className="panel empty-catalog">Nenhuma peça cadastrada ainda.</div>}
      </section>
    </main>
  );
}

export default function CustomizerPage() {
  const { garmentId } = useParams();
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const [garment, setGarment] = useState(null);
  const [clientUser, setClientUser] = useState(null);
  const [view, setView] = useState('front');
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [colorChoices, setColorChoices] = useState({});
  const [logos, setLogos] = useState([]);
  const [loading, setLoading] = useState(Boolean(garmentId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [orderId, setOrderId] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [quantity, setQuantity] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [pdfMapping, setPdfMapping] = useState(null);

  const selectedRegion = useMemo(
    () => garment?.regions?.find((region) => region.id === selectedRegionId) ?? null,
    [garment, selectedRegionId],
  );

  useEffect(() => {
    if (!garmentId) return;
    setLoading(true);
    Promise.all([getGarment(garmentId), ensureClientUser()])
      .then(([data, user]) => {
        if (!data) throw new Error('Peça não encontrada.');
        setGarment(data);
        setClientUser(user);
        const views = availableViews(data);
        setView(views[0] ?? 'front');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [garmentId]);

  if (!garmentId) return <Catalog />;
  if (loading) return <main className="loading-screen">Carregando peça…</main>;
  if (!garment) return <main className="loading-screen"><div><p>{error || 'Peça não encontrada.'}</p><Link to="/">Voltar</Link></div></main>;

  function selectRegion(region) {
    if (region.locked) return;
    setSelectedRegionId(region.id);
  }

  function changeSelectedColor(color) {
    if (!selectedRegion || selectedRegion.locked) return;
    setColorChoices((current) => ({ ...current, [selectedRegion.id]: color }));
  }

  function releasePdfMapping(mapping = pdfMapping) {
    mapping?.pages?.forEach((page) => {
      if (page.previewUrl) URL.revokeObjectURL(page.previewUrl);
    });
  }

  function cancelPdfMapping() {
    if (busy) return;
    releasePdfMapping();
    setPdfMapping(null);
    setMessage('');
  }

  function changePdfAssignment(pageNumber, targetView) {
    setPdfMapping((current) => current ? {
      ...current,
      assignments: current.assignments.map((item) => (
        item.pageNumber === pageNumber ? { ...item, targetView } : item
      )),
    } : current);
  }

  async function confirmPdfMapping() {
    if (!pdfMapping) return;
    setBusy(true);
    setError('');
    setMessage('Enviando PDF vetorial e preparando as logos…');

    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const originalUrl = await uploadClientLogoOriginalPdf(pdfMapping.file, user.uid);
      const selected = pdfMapping.assignments.filter((item) => item.targetView !== 'skip');

      for (const assignment of selected) {
        const page = pdfMapping.pages.find((item) => item.pageNumber === assignment.pageNumber);
        if (!page) continue;
        const previewUrl = await uploadClientLogo(page.previewFile, user.uid);
        const sameViewItems = selected.filter((item) => item.targetView === assignment.targetView);
        const sameViewIndex = sameViewItems.findIndex((item) => item.pageNumber === assignment.pageNumber);
        const spread = sameViewItems.length > 1;
        const initialX = spread ? (sameViewIndex === 0 ? 0.3 : sameViewIndex === 1 ? 0.7 : 0.5) : 0.5;

        await stageRef.current?.addLogo(previewUrl, {
          sourceUrl: originalUrl,
          sourceName: pdfMapping.file.name,
          sourceType: 'pdf',
          sourcePage: assignment.pageNumber,
          sourcePageCount: pdfMapping.pageCount,
          targetView: assignment.targetView,
          initialX,
          initialY: 0.5,
        });
      }

      const firstTarget = selected[0]?.targetView;
      if (firstTarget) {
        setView(firstTarget);
        setSelectedRegionId(null);
      }

      releasePdfMapping(pdfMapping);
      setPdfMapping(null);
      setMessage(`${selected.length} logo(s) do PDF adicionada(s). Troque entre Frente e Costas para ajustar cada posição.`);
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogo(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('Preparando logo…');
    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);

      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        setMessage('Lendo páginas do PDF vetorial…');
        const { pages, pageCount, truncated } = await renderPdfLogoPreviews(file, 8);

        if (pageCount > 1) {
          const views = availableViews(garment);
          const hasSeparateSides = views.includes('front') && views.includes('back');
          const assignments = pages.map((page, index) => ({
            pageNumber: page.pageNumber,
            targetView: hasSeparateSides
              ? (index === 0 ? 'front' : index === 1 ? 'back' : view)
              : (views.includes('combined') ? 'combined' : view),
          }));
          const pagesWithUrls = pages.map((page) => ({
            ...page,
            previewUrl: URL.createObjectURL(page.previewFile),
          }));

          setPdfMapping({
            file,
            pageCount,
            truncated,
            pages: pagesWithUrls,
            assignments,
            availableViews: views,
          });
          setMessage('');
          return;
        }

        const originalUrl = await uploadClientLogoOriginalPdf(file, user.uid);
        const page = pages[0] ?? await renderPdfLogoPreview(file, 1);
        const previewUrl = await uploadClientLogo(page.previewFile, user.uid);

        await stageRef.current?.addLogo(previewUrl, {
          sourceUrl: originalUrl,
          sourceName: file.name,
          sourceType: 'pdf',
          sourcePage: 1,
          sourcePageCount: 1,
          targetView: view,
        });

        setMessage('PDF vetorial adicionado. O arquivo original será enviado com o pedido para a produção.');
      } else {
        setMessage('Enviando logo…');
        const url = await uploadClientLogo(file, user.uid);
        await stageRef.current?.addLogo(url, {
          sourceUrl: url,
          sourceName: file.name,
          sourceType: 'image',
          sourcePage: 1,
          sourcePageCount: 1,
          targetView: view,
        });
        setMessage('Logo adicionada. Arraste, redimensione ou gire diretamente sobre a peça.');
      }
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeLogo() {
    const removed = stageRef.current?.removeSelectedLogo();
    setMessage(removed ? 'Logo selecionada removida.' : 'Clique primeiro em uma logo para removê-la.');
  }

  async function downloadCurrentImage() {
    setBusy(true);
    setError('');
    setMessage(`Gerando ${VIEW_LABELS[view].toLowerCase()} para download…`);
    try {
      const blob = await stageRef.current?.exportView(view);
      if (!blob) throw new Error('Não foi possível gerar a imagem desta vista.');

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(garment.name)}-${view}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage(`${VIEW_LABELS[view]} baixada em PNG com sucesso.`);
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  function openCheckout() {
    setError('');
    setMessage('');
    setOrderId('');
    setCheckoutError('');
    setCheckoutOpen(true);
  }

  function closeCheckout() {
    if (busy) return;
    setCheckoutOpen(false);
    setCheckoutError('');
  }

  async function handleCheckoutSubmit(event) {
    event.preventDefault();
    const cleanName = customerName.trim();
    const cleanWhatsapp = customerWhatsapp.trim();
    const cleanQuantity = quantity.trim();

    if (!cleanName) {
      setCheckoutError('Digite seu nome.');
      return;
    }
    if (!cleanWhatsapp) {
      setCheckoutError('Digite seu WhatsApp.');
      return;
    }

    let parsedQuantity = null;
    if (cleanQuantity) {
      parsedQuantity = Number(cleanQuantity);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
        setCheckoutError('A quantidade deve ser um número inteiro maior que zero.');
        return;
      }
    }

    setCheckoutError('');
    setBusy(true);
    setError('');
    setMessage('Gerando arte final e enviando pedido…');
    setOrderId('');

    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const finalImages = {};

      for (const targetView of availableViews(garment)) {
        const blob = await stageRef.current?.exportView(targetView);
        if (blob) {
          finalImages[targetView] = await uploadFinalRender(blob, user.uid, `${targetView}-${garmentId}`);
        }
      }

      const effectiveColors = Object.fromEntries((garment.regions ?? []).map((region) => [
        region.id,
        colorChoices[region.id] ?? region.defaultColor,
      ]));

      const firstFinalImage = finalImages.front || finalImages.combined || finalImages.back || '';
      const id = await createOrder({
        garmentId,
        garmentName: garment.name,
        clientUid: user.uid,
        customerName: cleanName,
        whatsapp: cleanWhatsapp,
        quantity: parsedQuantity,
        colorChoices: effectiveColors,
        logos,
        finalImages,
        finalImageUrl: firstFinalImage,
      });

      setCheckoutOpen(false);
      setOrderId(id);
      setMessage('Pedido enviado com sucesso. A arte final e seus dados foram anexados ao pedido.');
    } catch (err) {
      setCheckoutError(err.message || 'Não foi possível enviar o pedido.');
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  const regionsInView = (garment.regions ?? [])
    .filter((region) => region.view === view)
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));

  const views = availableViews(garment);

  return (
    <main className="app-shell customer-shell">
      <div className="martinpel-appbar customer-brandbar">
        <MartinpelBrand compact subtitle="Personalização em tempo real" />
        <Link className="button button-light back-to-catalog" to="/">← Voltar ao catálogo</Link>
      </div>

      <header className="customer-header martinpel-page-header">
        <div className="page-heading-block">
          <p className="eyebrow">Customização da peça</p>
          <h1>{garment.name}</h1>
          <p className="page-subtitle">Personalize as áreas disponíveis, posicione sua logo e visualize o resultado antes de enviar o pedido.</p>
        </div>
        <div className="customer-view-tabs">
          {views.map((targetView) => (
            <button
              key={targetView}
              type="button"
              className={view === targetView ? 'active' : ''}
              onClick={() => { setView(targetView); setSelectedRegionId(null); }}
            >
              {VIEW_LABELS[targetView]}
            </button>
          ))}
        </div>
      </header>

      {(message || error) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}{orderId && <strong className="order-code"> Código: {orderId}</strong>}</div>}

      <section className="customer-layout customer-workspace">
        <section className="panel customer-stage-panel">
          <CustomerStage
            ref={stageRef}
            garment={garment}
            view={view}
            colorChoices={colorChoices}
            onRegionClick={selectRegion}
            onLogosChange={setLogos}
          />
        </section>

        <aside className="panel customer-tools">
          <div><p className="eyebrow">Personalização</p><h2>Cores e logos</h2></div>
          <p className="muted customer-help">Clique numa área da roupa para alterar a cor. Clique numa logo para mover, girar ou redimensionar.</p>

          <div className="region-choice-list">
            {regionsInView.map((region) => (
              <button
                key={region.id}
                type="button"
                className={`region-choice ${selectedRegionId === region.id ? 'active' : ''} ${region.locked ? 'locked' : ''}`}
                onClick={() => selectRegion(region)}
                disabled={region.locked}
              >
                <span className="color-dot" style={{ background: colorChoices[region.id] ?? region.defaultColor }} />
                <span>{region.label}</span>
                {region.locked && <small>🔒</small>}
              </button>
            ))}
          </div>

          {selectedRegion && !selectedRegion.locked && (
            <div className="selected-color-box">
              <label>Cor de {selectedRegion.label}<input type="color" value={colorChoices[selectedRegion.id] ?? selectedRegion.defaultColor} onChange={(event) => changeSelectedColor(event.target.value)} /></label>
              <button type="button" className="mini-link" onClick={() => setColorChoices((current) => { const next = { ...current }; delete next[selectedRegion.id]; return next; })}>Voltar à cor padrão</button>
            </div>
          )}

          <div className="tool-divider" />
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => handleLogo(event.target.files?.[0])} />
          <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar logo</button>
          <p className="logo-upload-help">Aceita PNG, JPG, WEBP ou PDF vetorial. PDFs originais são preservados para a produção.</p>
          <button type="button" className="button button-secondary full-width" disabled={busy || logos.length === 0} onClick={removeLogo}>Remover logo selecionada</button>
          <div className="logo-count">{logos.length} logo(s) adicionada(s)</div>

          <div className="tool-divider" />
          <button type="button" className="button button-success finalize-button" disabled={busy} onClick={openCheckout}>{busy ? 'Processando…' : 'Finalizar pedido'}</button>
          <button type="button" className="button button-secondary full-width download-final-button" disabled={busy} onClick={downloadCurrentImage}>Baixar imagem pronta · {VIEW_LABELS[view]}</button>
          {views.length > 1 && <p className="download-help">Troque entre as abas acima para baixar cada vista separadamente.</p>}
        </aside>
      </section>

      {pdfMapping && (
        <PdfLogoPageMapper
          fileName={pdfMapping.file.name}
          pages={pdfMapping.pages}
          pageCount={pdfMapping.pageCount}
          assignments={pdfMapping.assignments}
          availableViews={pdfMapping.availableViews}
          busy={busy}
          onChange={changePdfAssignment}
          onCancel={cancelPdfMapping}
          onConfirm={confirmPdfMapping}
        />
      )}

      {checkoutOpen && (
        <div className="checkout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}>
          <form className="panel checkout-card" onSubmit={handleCheckoutSubmit}>
            <div>
              <p className="eyebrow">Finalizar pedido</p>
              <h2>Dados do cliente</h2>
              <p className="muted checkout-intro">A imagem será salva exatamente como você deixou a peça, incluindo cores e logos.</p>
            </div>

            <label>Nome
              <input autoFocus value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Seu nome" autoComplete="name" disabled={busy} />
            </label>

            <label>WhatsApp
              <input type="tel" value={customerWhatsapp} onChange={(event) => setCustomerWhatsapp(event.target.value)} placeholder="Ex.: (62) 99999-9999" autoComplete="tel" disabled={busy} />
            </label>

            <label>Quantidade <span className="optional-label">(opcional)</span>
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ex.: 20" disabled={busy} />
            </label>

            {checkoutError && <div className="checkout-error">{checkoutError}</div>}

            <div className="checkout-actions">
              <button type="button" className="button button-secondary" onClick={closeCheckout} disabled={busy}>Cancelar</button>
              <button type="submit" className="button button-success" disabled={busy}>{busy ? 'Enviando pedido…' : 'Confirmar pedido'}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
