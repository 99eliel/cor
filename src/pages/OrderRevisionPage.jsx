import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerStage from '../components/CustomerStage';
import MartinpelBrand from '../components/MartinpelBrand';
import PdfLogoLibrary from '../components/PdfLogoLibrary';
import { getGarment } from '../lib/garmentRepo';
import { getOrderForRevision, saveOrderRevision } from '../lib/orderRepo';
import { renderPdfLogoPreviews } from '../lib/pdfLogoPreview';
import { uploadClientLogo, uploadClientLogoOriginalPdf, uploadFinalRender } from '../lib/storageImages';
import '../customer.css';
import '../revision.css';

const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

const PLACEMENT_PRESETS = [
  { label: 'Livre', x: null, y: null },
  { label: 'Peito esquerdo', x: 0.35, y: 0.27 },
  { label: 'Peito direito', x: 0.65, y: 0.27 },
  { label: 'Centro frontal', x: 0.5, y: 0.35 },
  { label: 'Costas superior', x: 0.5, y: 0.24 },
  { label: 'Costas central', x: 0.5, y: 0.42 },
  { label: 'Manga esquerda', x: 0.2, y: 0.32 },
  { label: 'Manga direita', x: 0.8, y: 0.32 },
];

function availableViews(garment) {
  return ['front', 'back', 'combined'].filter((key) => garment?.images?.[key]);
}

function approvalUrl(orderId, token) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/aprovar/${orderId}/${token}`;
}

export default function OrderRevisionPage({ user, isAdmin = false, logout }) {
  const { orderId } = useParams();
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const restoredRef = useRef(false);
  const [order, setOrder] = useState(null);
  const [garment, setGarment] = useState(null);
  const [view, setView] = useState('front');
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [colorChoices, setColorChoices] = useState({});
  const [logos, setLogos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [logoPlacement, setLogoPlacement] = useState('Livre');
  const [logoWidthCm, setLogoWidthCm] = useState('9');
  const [pdfLibrary, setPdfLibrary] = useState(null);
  const [pdfBusyPage, setPdfBusyPage] = useState(null);
  const [newApproval, setNewApproval] = useState(null);

  const selectedRegion = useMemo(
    () => garment?.regions?.find((region) => region.id === selectedRegionId) ?? null,
    [garment, selectedRegionId],
  );

  const views = useMemo(() => availableViews(garment), [garment]);
  const regionsInView = useMemo(
    () => (garment?.regions ?? []).filter((region) => region.view === view).sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0)),
    [garment, view],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getOrderForRevision(orderId), Promise.resolve(user)])
      .then(async ([orderData]) => {
        if (!active) return;
        if (!orderData) throw new Error('Pedido não encontrado ou sem permissão para revisão.');
        const garmentData = await getGarment(orderData.garmentId);
        if (!garmentData) throw new Error('A peça original deste pedido não está mais disponível no catálogo.');
        if (!active) return;
        setOrder(orderData);
        setGarment(garmentData);
        setColorChoices(orderData.colorChoices || {});
        const firstView = availableViews(garmentData)[0] || 'front';
        setView(firstView);
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [orderId, user]);

  useEffect(() => {
    if (!order || !garment || restoredRef.current || !stageRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        stageRef.current?.clearLogos();
        for (const logo of order.logos || []) {
          if (cancelled) return;
          const url = logo.processedUrl || logo.storageUrl || logo.sourceUrl;
          if (!url) continue;
          await stageRef.current?.addLogo(url, {
            ...logo,
            targetView: logo.position?.view || view,
            initialX: logo.position?.x,
            initialY: logo.position?.y,
            rotation: logo.position?.rotation,
          });
        }
      } catch (err) {
        if (!cancelled) setError(`Não foi possível restaurar todas as logos da versão anterior: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [order, garment, view]);

  function selectRegion(region) {
    if (!region.locked) setSelectedRegionId(region.id);
  }

  function changeSelectedColor(color) {
    if (!selectedRegion || selectedRegion.locked) return;
    setColorChoices((current) => ({ ...current, [selectedRegion.id]: color }));
  }

  function applyLogoProductionSettings() {
    const preset = PLACEMENT_PRESETS.find((item) => item.label === logoPlacement) || PLACEMENT_PRESETS[0];
    const widthCm = Number(logoWidthCm);
    if (!Number.isFinite(widthCm) || widthCm <= 0 || widthCm > 100) {
      setError('Informe uma largura válida da logo em centímetros.');
      return;
    }
    const updated = stageRef.current?.updateSelectedLogoProductionMeta({
      placementLabel: preset.label,
      widthCm,
      x: Number.isFinite(preset.x) ? preset.x : undefined,
      y: Number.isFinite(preset.y) ? preset.y : undefined,
    });
    if (!updated) {
      setError('Clique primeiro na logo que deseja configurar.');
      return;
    }
    setError('');
    setMessage(`Logo ajustada: ${preset.label} · ${widthCm} cm.`);
  }

  function removeLogo() {
    const removed = stageRef.current?.removeSelectedLogo();
    setMessage(removed ? 'Logo removida desta nova versão.' : 'Clique primeiro na logo que deseja remover.');
  }

  function releasePdfLibrary(library = pdfLibrary) {
    library?.pages?.forEach((page) => page.previewUrl && URL.revokeObjectURL(page.previewUrl));
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
    const storageUrl = await uploadClientLogo(page.previewFile, user.uid);
    setPdfLibrary((current) => current ? {
      ...current,
      pages: current.pages.map((item) => item.pageNumber === pageNumber ? { ...item, storageUrl } : item),
    } : current);
    return storageUrl;
  }

  async function addPdfPage(pageNumber) {
    if (!pdfLibrary) return;
    setPdfBusyPage(pageNumber);
    setError('');
    try {
      const storageUrl = await ensurePdfPageStorageUrl(pageNumber);
      await stageRef.current?.addLogo(storageUrl, {
        sourceUrl: pdfLibrary.originalUrl,
        originalUrl: pdfLibrary.originalUrl,
        sourceName: pdfLibrary.fileName,
        sourceType: 'pdf',
        sourcePage: pageNumber,
        sourcePageCount: pdfLibrary.pageCount,
        targetView: view,
        placementLabel: 'Livre',
        widthCm: 9,
      });
      setMessage(`Página ${pageNumber} adicionada à nova versão.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfBusyPage(null);
    }
  }

  async function addAllPdfPages() {
    for (const page of pdfLibrary?.pages || []) await addPdfPage(page.pageNumber);
  }

  async function handleLogo(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        releasePdfLibrary();
        const originalUrl = await uploadClientLogoOriginalPdf(file, user.uid);
        const { pages, pageCount } = await renderPdfLogoPreviews(file);
        setPdfLibrary({
          fileName: file.name,
          originalUrl,
          pageCount,
          pages: pages.map((page) => ({ ...page, previewUrl: URL.createObjectURL(page.previewFile), storageUrl: '' })),
        });
        setMessage(`PDF carregado com ${pageCount} página(s). Escolha o que entra na nova versão.`);
      } else {
        const url = await uploadClientLogo(file, user.uid);
        await stageRef.current?.addLogo(url, {
          sourceUrl: url,
          originalUrl: url,
          sourceName: file.name,
          sourceType: 'image',
          sourcePage: 1,
          sourcePageCount: 1,
          targetView: view,
          placementLabel: 'Livre',
          widthCm: 9,
        });
        setMessage('Nova logo adicionada à revisão.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveRevision() {
    if (!order || !garment) return;
    if (order.approvalStatus !== 'changes_requested') {
      setError('Este pedido não está aguardando uma correção solicitada pelo cliente.');
      return;
    }
    const incompleteLogo = logos.find((logo) => !logo.placementLabel || !Number(logo.widthCm));
    if (incompleteLogo) {
      setError('Há uma logo sem posição ou medida de produção. Configure-a antes de gerar a nova versão.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('Gerando nova versão da arte…');
    try {
      const finalImages = {};
      for (const targetView of availableViews(garment)) {
        const blob = await stageRef.current?.exportView(targetView);
        if (blob) finalImages[targetView] = await uploadFinalRender(blob, user.uid, `${targetView}-${order.garmentId}-v${(order.designVersion || 1) + 1}`);
      }
      const effectiveColors = Object.fromEntries((garment.regions ?? []).map((region) => [region.id, colorChoices[region.id] ?? region.defaultColor]));
      const firstFinalImage = finalImages.front || finalImages.combined || finalImages.back || '';
      const result = await saveOrderRevision(order.id, {
        colorChoices: effectiveColors,
        logos,
        finalImages,
        finalImageUrl: firstFinalImage,
      });
      setNewApproval(result);
      setOrder((current) => ({
        ...current,
        colorChoices: effectiveColors,
        logos,
        finalImages,
        finalImageUrl: firstFinalImage,
        designVersion: result.designVersion,
        approvalToken: result.approvalToken,
        approvalStatus: 'pending',
        approvalNote: '',
        status: 'approval',
      }));
      setMessage(`Versão ${result.designVersion} criada. O cliente já pode receber o novo link.`);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a nova versão.');
      setMessage('');
    } finally {
      setBusy(false);
    }
  }

  async function copyNewLink() {
    if (!newApproval) return;
    const url = approvalUrl(order.id, newApproval.approvalToken);
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link da nova versão copiado.');
    } catch {
      window.prompt('Copie o link de aprovação:', url);
    }
  }

  function sendWhatsApp() {
    if (!newApproval) return;
    const number = String(order.whatsapp || '').replace(/\D/g, '');
    const url = approvalUrl(order.id, newApproval.approvalToken);
    const text = `Olá! A versão V${newApproval.designVersion} da arte do pedido ${order.displayCode || order.id} está pronta para nova conferência.\n\nAcesse para aprovar ou solicitar outra alteração:\n${url}`;
    const target = number ? `https://wa.me/55${number.replace(/^55/, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <main className="loading-screen">Carregando revisão do pedido…</main>;
  if (!order || !garment) return <main className="loading-screen"><div><p>{error || 'Pedido indisponível.'}</p><Link to={isAdmin ? '/admin' : '/meus-pedidos'}>Voltar</Link></div></main>;

  return (
    <main className="app-shell customer-shell revision-shell">
      <div className="martinpel-appbar customer-brandbar seller-brandbar">
        <MartinpelBrand compact subtitle={`Revisão ${order.displayCode || order.id}`} />
        <div className="seller-global-actions">
          <Link className="button button-light" to={isAdmin ? '/admin' : '/meus-pedidos'}>← Voltar aos pedidos</Link>
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </div>

      <section className="revision-request panel">
        <div>
          <p className="eyebrow">Solicitação do cliente · V{order.designVersion || 1}</p>
          <h1>{order.approvalNote || 'Cliente solicitou uma alteração na arte.'}</h1>
          <p>Faça os ajustes abaixo e gere a próxima versão mantendo o mesmo pedido {order.displayCode || order.id}.</p>
        </div>
        <span>Próxima: V{(order.designVersion || 1) + 1}</span>
      </section>

      {(message || error) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}</div>}

      {newApproval ? (
        <section className="panel revision-ready-card">
          <div><p className="eyebrow">Nova aprovação</p><h2>V{newApproval.designVersion} pronta para o cliente</h2><p>O link anterior não aprova esta nova versão.</p></div>
          <div className="revision-ready-actions">
            <button className="button button-secondary" type="button" onClick={copyNewLink}>Copiar link</button>
            <button className="button button-success" type="button" onClick={sendWhatsApp}>Enviar V{newApproval.designVersion} pelo WhatsApp</button>
          </div>
        </section>
      ) : (
        <>
          <header className="customer-header martinpel-page-header customer-piece-header">
            <div className="page-heading-block"><p className="eyebrow">Corrigir arte</p><h1>{garment.name}</h1><p className="page-subtitle">Ajuste somente o necessário e envie uma nova versão para aprovação.</p></div>
            <div className="customer-view-tabs">{views.map((targetView) => <button key={targetView} type="button" className={view === targetView ? 'active' : ''} onClick={() => { setView(targetView); setSelectedRegionId(null); }}>{VIEW_LABELS[targetView]}</button>)}</div>
          </header>

          <section className="customer-layout customer-workspace">
            <section className="panel customer-stage-panel"><CustomerStage ref={stageRef} garment={garment} view={view} colorChoices={colorChoices} onRegionClick={selectRegion} onLogosChange={setLogos} /></section>
            <aside className="panel customer-tools customer-tools-v2">
              <div className="customer-tools-head"><div><p className="eyebrow">Versão {(order.designVersion || 1) + 1}</p><h2>Ajustar personalização</h2></div><span className="customer-tools-badge">{logos.length} logo(s)</span></div>

              <div className="customer-tool-section-title"><span>01</span><strong>Cores da peça</strong></div>
              <div className="region-choice-list">{regionsInView.map((region) => <button key={region.id} type="button" className={`region-choice ${selectedRegionId === region.id ? 'active' : ''} ${region.locked ? 'locked' : ''}`} onClick={() => selectRegion(region)} disabled={region.locked}><span className="color-dot" style={{ background: colorChoices[region.id] ?? region.defaultColor }} /><span>{region.label}</span></button>)}</div>
              {selectedRegion && !selectedRegion.locked && <div className="selected-color-box"><label>Cor de {selectedRegion.label}<input type="color" value={colorChoices[selectedRegion.id] ?? selectedRegion.defaultColor} onChange={(event) => changeSelectedColor(event.target.value)} /></label></div>}

              <div className="tool-divider" />
              <div className="customer-tool-section-title"><span>02</span><strong>Logos</strong></div>
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => handleLogo(event.target.files?.[0])} />
              <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar / trocar logo</button>
              {pdfLibrary && <PdfLogoLibrary fileName={pdfLibrary.fileName} pages={pdfLibrary.pages} pageCount={pdfLibrary.pageCount} currentView={view} busyPage={pdfBusyPage} onAddPage={addPdfPage} onAddAll={addAllPdfPages} onClose={closePdfLibrary} />}

              {logos.length > 0 && <div className="logo-production-settings"><strong>Logo selecionada</strong><label>Posição<select value={logoPlacement} onChange={(event) => setLogoPlacement(event.target.value)}>{PLACEMENT_PRESETS.map((preset) => <option key={preset.label}>{preset.label}</option>)}</select></label><label>Largura (cm)<input type="number" min="1" max="100" step="0.5" value={logoWidthCm} onChange={(event) => setLogoWidthCm(event.target.value)} /></label><button type="button" className="button button-secondary full-width" onClick={applyLogoProductionSettings}>Aplicar na logo selecionada</button></div>}
              <button type="button" className="button button-secondary full-width" disabled={busy || logos.length === 0} onClick={removeLogo}>Remover logo selecionada</button>

              <div className="tool-divider" />
              <button type="button" className="button button-success finalize-button" disabled={busy} onClick={saveRevision}>{busy ? 'Gerando nova versão…' : `Salvar V${(order.designVersion || 1) + 1} e gerar novo link`}</button>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
