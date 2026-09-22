import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BackgroundRemovalDialog from '../components/BackgroundRemovalDialog';
import CustomerStage from '../components/CustomerStage';
import MartinpelBrand from '../components/MartinpelBrand';
import PdfLogoLibrary from '../components/PdfLogoLibrary';
import { ensureClientUser } from '../lib/clientAuth';
import { getGarment, listGarments } from '../lib/garmentRepo';
import { createOrder } from '../lib/orderRepo';
import { renderPdfLogoPreviews } from '../lib/pdfLogoPreview';
import { backgroundRemovedFile } from '../lib/localBackgroundRemoval';
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
  const [pdfLibrary, setPdfLibrary] = useState(null);
  const [pdfBusyPage, setPdfBusyPage] = useState(null);
  const [backgroundToolLogo, setBackgroundToolLogo] = useState(null);
  const [backgroundApplying, setBackgroundApplying] = useState(false);

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

  function releasePdfLibrary(libraryState = pdfLibrary) {
    libraryState?.pages?.forEach((page) => {
      if (page.previewUrl) URL.revokeObjectURL(page.previewUrl);
    });
  }

  function closePdfLibrary() {
    if (pdfBusyPage !== null) return;
    releasePdfLibrary();
    setPdfLibrary(null);
  }

  async function ensurePdfPageStorageUrl(pageNumber) {
    const page = pdfLibrary?.pages?.find((item) => item.pageNumber === pageNumber);
    if (!page) throw new Error('Página do PDF não encontrada.');
    if (page.storageUrl) return page.storageUrl;

    const user = clientUser ?? await ensureClientUser();
    setClientUser(user);
    const storageUrl = await uploadClientLogo(page.previewFile, user.uid);
    setPdfLibrary((current) => current ? {
      ...current,
      pages: current.pages.map((item) => (
        item.pageNumber === pageNumber ? { ...item, storageUrl } : item
      )),
    } : current);
    return storageUrl;
  }

  async function addPdfPage(pageNumber, options = {}) {
    if (!pdfLibrary) return;
    setPdfBusyPage(pageNumber);
    setError('');

    try {
      const storageUrl = await ensurePdfPageStorageUrl(pageNumber);
      const index = pdfLibrary.pages.findIndex((item) => item.pageNumber === pageNumber);
      const count = pdfLibrary.pages.length;
      const initialX = Number.isFinite(options.initialX)
        ? options.initialX
        : count > 1
          ? 0.25 + ((index % 3) * 0.25)
          : 0.5;
      const initialY = Number.isFinite(options.initialY)
        ? options.initialY
        : 0.35 + ((Math.floor(index / 3) % 3) * 0.18);

      await stageRef.current?.addLogo(storageUrl, {
        sourceUrl: pdfLibrary.originalUrl,
        sourceName: pdfLibrary.fileName,
        sourceType: 'pdf',
        sourcePage: pageNumber,
        sourcePageCount: pdfLibrary.pageCount,
        targetView: view,
        initialX: Math.min(0.82, initialX),
        initialY: Math.min(0.82, initialY),
      });

      setMessage(`Página ${pageNumber} adicionada em ${VIEW_LABELS[view]}. Agora arraste para onde quiser.`);
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setPdfBusyPage(null);
    }
  }

  async function addAllPdfPages() {
    if (!pdfLibrary) return;
    setError('');
    setMessage(`Adicionando ${pdfLibrary.pages.length} páginas em ${VIEW_LABELS[view]}…`);

    for (let index = 0; index < pdfLibrary.pages.length; index += 1) {
      const page = pdfLibrary.pages[index];
      await addPdfPage(page.pageNumber, {
        initialX: 0.24 + ((index % 3) * 0.26),
        initialY: 0.28 + ((Math.floor(index / 3) % 3) * 0.22),
      });
    }

    setMessage(`Todas as páginas do PDF foram adicionadas em ${VIEW_LABELS[view]}. Você pode mover cada uma livremente.`);
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
        releasePdfLibrary();
        setMessage('Lendo todas as páginas do PDF vetorial…');

        const originalUrl = await uploadClientLogoOriginalPdf(file, user.uid);
        const { pages, pageCount } = await renderPdfLogoPreviews(file);
        const pagesWithUrls = pages.map((page) => ({
          ...page,
          previewUrl: URL.createObjectURL(page.previewFile),
          storageUrl: '',
        }));

        setPdfLibrary({
          fileName: file.name,
          originalUrl,
          pageCount,
          pages: pagesWithUrls,
        });

        setMessage(
          pageCount === 1
            ? 'PDF carregado. A página está disponível abaixo para você adicionar onde quiser.'
            : `PDF carregado com ${pageCount} páginas. Escolha qualquer página abaixo e adicione onde quiser.`,
        );
      } else {
        const processingSource = URL.createObjectURL(file);
        const url = await uploadClientLogo(file, user.uid);
        await stageRef.current?.addLogo(url, {
          sourceUrl: url,
          originalUrl: url,
          processingSource,
          processingSourceOwned: true,
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

  function openBackgroundRemoval() {
    const selected = stageRef.current?.getSelectedLogo();
    if (!selected) {
      setError('Clique primeiro na logo da qual deseja remover o fundo.');
      setMessage('');
      return;
    }
    if (selected.sourceType === 'pdf') {
      setError('PDF vetorial não precisa deste tratamento. Use a ferramenta em logos PNG, JPG ou WEBP.');
      setMessage('');
      return;
    }
    setError('');
    setBackgroundToolLogo(selected);
  }

  async function applyBackgroundRemoval(blob) {
    if (!backgroundToolLogo) return;
    setBackgroundApplying(true);
    setError('');
    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const processedFile = backgroundRemovedFile(blob, backgroundToolLogo.sourceName || 'logo.png');
      const processedUrl = await uploadClientLogo(processedFile, user.uid);
      const originalUrl = backgroundToolLogo.originalUrl || backgroundToolLogo.sourceUrl || backgroundToolLogo.storageUrl;

      const replaced = await stageRef.current?.replaceSelectedLogoImage(processedUrl, {
        originalUrl,
        sourceUrl: backgroundToolLogo.sourceUrl || originalUrl,
        sourceName: backgroundToolLogo.sourceName || processedFile.name,
        processedUrl,
        backgroundRemoved: true,
      });
      if (!replaced) throw new Error('A logo selecionada não está mais disponível.');

      setBackgroundToolLogo(null);
      setMessage('Fundo removido localmente. O arquivo original foi preservado para conferência e produção.');
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBackgroundApplying(false);
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

      <div className="customer-flow-strip" aria-label="Etapas da personalização">
        <div className="is-active"><span>1</span><strong>Cores</strong><small>Escolha as áreas</small></div>
        <div className={logos.length > 0 ? 'is-active' : ''}><span>2</span><strong>Logos</strong><small>Posicione sua marca</small></div>
        <div className={logos.length > 0 ? 'is-active' : ''}><span>3</span><strong>Revisar</strong><small>Confira o resultado</small></div>
        <div className={orderId ? 'is-active' : ''}><span>4</span><strong>Pedido</strong><small>Enviar solicitação</small></div>
      </div>

      <header className="customer-header martinpel-page-header customer-piece-header">
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

        <aside className="panel customer-tools customer-tools-v2">
          <div className="customer-tools-head">
            <div><p className="eyebrow">Personalização</p><h2>Monte sua peça</h2></div>
            <span className="customer-tools-badge">{logos.length} logo(s)</span>
          </div>
          <p className="customer-help">Clique numa área da roupa para alterar a cor. Selecione uma logo para mover, girar, redimensionar ou remover o fundo.</p>

          <div className="customer-tool-section-title"><span>01</span><strong>Cores da peça</strong></div>
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
          <div className="customer-tool-section-title"><span>02</span><strong>Aplicar sua marca</strong></div>
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => handleLogo(event.target.files?.[0])} />
          <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar logo</button>
          <p className="logo-upload-help">Aceita PNG, JPG, WEBP ou PDF vetorial. PDFs viram uma biblioteca de páginas para você usar livremente.</p>
          {pdfLibrary && (
            <PdfLogoLibrary
              fileName={pdfLibrary.fileName}
              pages={pdfLibrary.pages}
              pageCount={pdfLibrary.pageCount}
              currentView={view}
              busyPage={pdfBusyPage}
              onAddPage={addPdfPage}
              onAddAll={addAllPdfPages}
              onClose={closePdfLibrary}
            />
          )}
          <button type="button" className="button button-background-local full-width" disabled={busy || logos.length === 0} onClick={openBackgroundRemoval}>✦ Remover fundo da logo</button>
          <button type="button" className="button button-secondary full-width" disabled={busy || logos.length === 0} onClick={removeLogo}>Remover logo selecionada</button>
          <div className="logo-count">{logos.length} logo(s) adicionada(s)</div>

          <div className="tool-divider" />
          <div className="customer-tool-section-title"><span>03</span><strong>Finalizar</strong></div>
          <button type="button" className="button button-success finalize-button" disabled={busy} onClick={openCheckout}>{busy ? 'Processando…' : 'Finalizar pedido'}</button>
          <button type="button" className="button button-secondary full-width download-final-button" disabled={busy} onClick={downloadCurrentImage}>Baixar imagem pronta · {VIEW_LABELS[view]}</button>
          {views.length > 1 && <p className="download-help">Troque entre as abas acima para baixar cada vista separadamente.</p>}
        </aside>
      </section>

      <BackgroundRemovalDialog
        open={Boolean(backgroundToolLogo)}
        source={backgroundToolLogo?.processingSource || backgroundToolLogo?.originalUrl || backgroundToolLogo?.sourceUrl}
        fileName={backgroundToolLogo?.sourceName}
        onCancel={() => { if (!backgroundApplying) setBackgroundToolLogo(null); }}
        onApply={applyBackgroundRemoval}
      />

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
