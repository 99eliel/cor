import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerStage from '../components/CustomerStage';
import { ensureClientUser } from '../lib/clientAuth';
import { getGarment, listGarments } from '../lib/garmentRepo';
import { createOrder } from '../lib/orderRepo';
import { uploadClientLogo, uploadFinalRender } from '../lib/storageImages';
import '../customer.css';

const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

function availableViews(garment) {
  return ['front', 'back', 'combined'].filter((key) => garment?.images?.[key]);
}

function Catalog() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listGarments().then(setItems).catch((err) => setError(err.message));
  }, []);

  return (
    <main className="app-shell catalog-shell">
      <header className="customer-header"><div><p className="eyebrow">Uniformes</p><h1>Escolha uma peça para personalizar</h1></div></header>
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

  async function handleLogo(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('Enviando logo…');
    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const url = await uploadClientLogo(file, user.uid);
      await stageRef.current?.addLogo(url);
      setMessage('Logo adicionada. Arraste, redimensione ou gire diretamente sobre a peça.');
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

  async function finalizeOrder() {
    setBusy(true);
    setError('');
    setMessage('Gerando arte final…');
    setOrderId('');
    try {
      const user = clientUser ?? await ensureClientUser();
      setClientUser(user);
      const finalImages = {};

      for (const targetView of availableViews(garment)) {
        const blob = await stageRef.current.exportView(targetView);
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
        clientUid: user.uid,
        colorChoices: effectiveColors,
        logos,
        finalImages,
        finalImageUrl: firstFinalImage,
      });
      setOrderId(id);
      setMessage('Pedido finalizado e salvo com sucesso.');
    } catch (err) {
      setError(err.message);
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
      <header className="customer-header">
        <div><Link className="back-link" to="/">← Todas as peças</Link><p className="eyebrow">Customização</p><h1>{garment.name}</h1></div>
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
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleLogo(event.target.files?.[0])} />
          <button type="button" className="button button-primary full-width" disabled={busy} onClick={() => fileInputRef.current?.click()}>+ Adicionar logo</button>
          <button type="button" className="button button-secondary full-width" disabled={busy || logos.length === 0} onClick={removeLogo}>Remover logo selecionada</button>
          <div className="logo-count">{logos.length} logo(s) adicionada(s)</div>

          <div className="tool-divider" />
          <button type="button" className="button button-success finalize-button" disabled={busy} onClick={finalizeOrder}>{busy ? 'Processando…' : 'Finalizar pedido'}</button>
        </aside>
      </section>
    </main>
  );
}
