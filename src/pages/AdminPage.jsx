import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAuth from '../components/AdminAuth';
import AdminLogoTester from '../components/AdminLogoTester';
import GarmentEditorCanvas from '../components/GarmentEditorCanvas';
import NewRegionDialog from '../components/NewRegionDialog';
import RegionSidebar from '../components/RegionSidebar';
import { createGarmentId, getGarment, listGarments, saveGarment } from '../lib/garmentRepo';
import { slugifyRegionId } from '../lib/geometry';
import { deleteOrder, listOrders, setOrderCompleted } from '../lib/orderRepo';
import { uploadGarmentImage } from '../lib/storageImages';
import '../admin.css';
import '../orders-actions.css';

const EMPTY_IMAGES = { front: '', back: '', combined: '' };
const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

function formatOrderDate(value) {
  try {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Data indisponível';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch {
    return 'Data indisponível';
  }
}

function whatsappHref(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function OrdersView({ orders, loading, error, onRefresh, onToggleCompleted, onDelete, actionId }) {
  const completedCount = orders.filter((order) => order.status === 'completed').length;
  const pendingCount = orders.length - completedCount;

  return (
    <section className="orders-section">
      <div className="panel orders-toolbar">
        <div>
          <p className="eyebrow">Pedidos recebidos</p>
          <h2>{orders.length} pedido(s)</h2>
          <div className="orders-summary">
            <span className="orders-summary-pending">{pendingCount} pendente(s)</span>
            <span className="orders-summary-completed">{completedCount} concluído(s)</span>
          </div>
        </div>
        <button className="button button-secondary" type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar pedidos'}</button>
      </div>

      {error && <div className="notice notice-error">{error}</div>}
      {!error && loading && orders.length === 0 && <div className="panel orders-empty">Carregando pedidos…</div>}
      {!error && !loading && orders.length === 0 && <div className="panel orders-empty">Nenhum pedido recebido ainda.</div>}

      <div className="orders-grid">
        {orders.map((order) => {
          let finalImages = Object.entries(order.finalImages ?? {}).filter(([, url]) => Boolean(url));
          if (finalImages.length === 0 && order.finalImageUrl) finalImages = [['final', order.finalImageUrl]];
          const whatsappLink = whatsappHref(order.whatsapp);
          const completed = order.status === 'completed';
          const isWorking = actionId === order.id;

          return (
            <article className={`panel order-card ${completed ? 'order-card-completed' : ''}`} key={order.id}>
              <div className="order-card-head">
                <div><span>Pedido</span><code>{order.id}</code></div>
                <div className="order-head-right">
                  <span className={`order-status ${completed ? 'is-completed' : 'is-pending'}`}>{completed ? 'Concluído' : 'Pendente'}</span>
                  <time>{formatOrderDate(order.createdAt)}</time>
                </div>
              </div>

              <div className="order-info-grid">
                <div><span>Cliente</span><strong>{order.customerName || 'Não informado'}</strong></div>
                <div><span>WhatsApp</span><strong>{order.whatsapp || 'Não informado'}</strong>{whatsappLink && <a href={whatsappLink} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}</div>
                <div><span>Quantidade</span><strong>{order.quantity ?? 'Não informada (opcional)'}</strong></div>
                <div><span>Peça</span><strong>{order.garmentName || order.garmentId || 'Não identificada'}</strong></div>
              </div>

              {completed && order.completedAt && (
                <div className="order-completed-note">Concluído em {formatOrderDate(order.completedAt)}</div>
              )}

              {finalImages.length > 0 && (
                <div className="order-images">
                  {finalImages.map(([imageView, url]) => (
                    <a className="order-image" href={url} target="_blank" rel="noreferrer" key={imageView}>
                      <img src={url} alt={`${order.garmentName || 'Peça'} - ${VIEW_LABELS[imageView] || 'Arte final'}`} />
                      <span>{VIEW_LABELS[imageView] || 'Arte final'} · abrir imagem</span>
                    </a>
                  ))}
                </div>
              )}

              <div className="order-actions">
                <button
                  className={`button ${completed ? 'button-secondary' : 'button-success'}`}
                  type="button"
                  disabled={isWorking}
                  onClick={() => onToggleCompleted(order)}
                >
                  {isWorking ? 'Salvando…' : completed ? 'Reabrir pedido' : 'Marcar como concluído'}
                </button>
                <button
                  className="button order-delete-button"
                  type="button"
                  disabled={isWorking}
                  onClick={() => onDelete(order)}
                >
                  Excluir
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AdminWorkspace({ logout }) {
  const fileInputRef = useRef(null);
  const [section, setSection] = useState('editor');
  const [garments, setGarments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [orderActionId, setOrderActionId] = useState('');
  const [garmentId, setGarmentId] = useState('');
  const [name, setName] = useState('');
  const [images, setImages] = useState(EMPTY_IMAGES);
  const [regions, setRegions] = useState([]);
  const [view, setView] = useState('front');
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [visibleIds, setVisibleIds] = useState(new Set());
  const [mode, setMode] = useState('idle');
  const [zoom, setZoom] = useState(1);
  const [previewColors, setPreviewColors] = useState({});
  const [regionDialogOpen, setRegionDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedRegion = useMemo(
    () => regions.find((region) => region.id === selectedRegionId) ?? null,
    [regions, selectedRegionId],
  );
  const isPreviewMode = mode === 'preview' || mode === 'logoTest';

  useEffect(() => {
    refreshGarments();
  }, []);

  async function refreshGarments() {
    try {
      const items = await listGarments();
      setGarments(items);
    } catch (err) {
      setError(`Não foi possível listar as peças: ${err.message}`);
    }
  }

  async function refreshOrders() {
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const items = await listOrders();
      setOrders(items);
    } catch (err) {
      setOrdersError(`Não foi possível carregar os pedidos: ${err.message}`);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function handleToggleOrder(order) {
    const completed = order.status === 'completed';
    setOrderActionId(order.id);
    setOrdersError('');
    try {
      await setOrderCompleted(order.id, !completed);
      setOrders((items) => items.map((item) => (
        item.id === order.id
          ? {
              ...item,
              status: completed ? 'pending' : 'completed',
              completedAt: completed ? null : new Date(),
            }
          : item
      )));
    } catch (err) {
      setOrdersError(`Não foi possível atualizar o pedido: ${err.message}`);
    } finally {
      setOrderActionId('');
    }
  }

  async function handleDeleteOrder(order) {
    const customer = order.customerName ? ` de ${order.customerName}` : '';
    const confirmed = window.confirm(`Excluir permanentemente o pedido${customer}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setOrderActionId(order.id);
    setOrdersError('');
    try {
      await deleteOrder(order.id);
      setOrders((items) => items.filter((item) => item.id !== order.id));
    } catch (err) {
      setOrdersError(`Não foi possível excluir o pedido: ${err.message}`);
    } finally {
      setOrderActionId('');
    }
  }

  function openOrders() {
    setSection('orders');
    refreshOrders();
  }

  function resetEditor() {
    setGarmentId('');
    setName('');
    setImages(EMPTY_IMAGES);
    setRegions([]);
    setVisibleIds(new Set());
    setSelectedRegionId(null);
    setView('front');
    setMode('idle');
    setPreviewColors({});
    setZoom(1);
    setMessage('Nova peça pronta para cadastro.');
    setError('');
  }

  async function loadGarment(id) {
    if (!id) return resetEditor();
    setBusy(true);
    setError('');
    try {
      const data = await getGarment(id);
      if (!data) throw new Error('Peça não encontrada.');
      const loadedImages = {
        front: data.images?.front ?? '',
        back: data.images?.back ?? '',
        combined: data.images?.combined ?? '',
      };
      setGarmentId(id);
      setName(data.name ?? '');
      setImages(loadedImages);
      setRegions(Array.isArray(data.regions) ? data.regions : []);
      setVisibleIds(new Set((data.regions ?? []).map((region) => region.id)));
      setPreviewColors(Object.fromEntries((data.regions ?? []).map((region) => [region.id, region.defaultColor])));
      setSelectedRegionId(null);
      setMode('idle');
      setView(loadedImages.front ? 'front' : loadedImages.back ? 'back' : 'combined');
      setMessage(`Peça “${data.name}” carregada.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function ensureGarmentId() {
    if (garmentId) return garmentId;
    if (!name.trim()) throw new Error('Digite o nome da peça antes de enviar a foto.');
    const id = createGarmentId(name.trim());
    setGarmentId(id);
    return id;
  }

  async function handleImageFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('Enviando imagem…');
    try {
      const id = ensureGarmentId();
      const url = await uploadGarmentImage(file, id, view);
      setImages((current) => ({ ...current, [view]: url }));
      setMessage(`${VIEW_LABELS[view]} enviada com sucesso.`);
    } catch (err) {
      setError(err.message);
      setMessage('');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function createRegion({ label, defaultColor }) {
    const id = slugifyRegionId(label, regions.map((region) => region.id));
    const viewCount = regions.filter((region) => region.view === view).length;
    const region = {
      id,
      label,
      view,
      zIndex: viewCount + 1,
      locked: false,
      defaultColor,
      polygons: [],
    };
    setRegions((items) => [...items, region]);
    setVisibleIds((current) => new Set([...current, id]));
    setPreviewColors((current) => ({ ...current, [id]: defaultColor }));
    setSelectedRegionId(id);
    setMode('draw');
    setRegionDialogOpen(false);
  }

  function updateRegion(id, changes) {
    setRegions((items) => items.map((region) => region.id === id ? { ...region, ...changes } : region));
    if (changes.defaultColor) {
      setPreviewColors((current) => ({ ...current, [id]: changes.defaultColor }));
    }
  }

  function toggleVisible(id) {
    setVisibleIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reorderRegions(orderedIds) {
    const count = orderedIds.length;
    const zById = Object.fromEntries(orderedIds.map((id, index) => [id, count - index]));
    setRegions((items) => items.map((region) => (
      region.view === view && zById[region.id]
        ? { ...region, zIndex: zById[region.id] }
        : region
    )));
  }

  async function handleSave() {
    setError('');
    setMessage('');
    if (!name.trim()) return setError('Digite o nome da peça.');
    if (!images.front && !images.back && !images.combined) {
      return setError('Envie pelo menos uma imagem: frente, costas ou frente + costas.');
    }
    if (regions.some((region) => !region.polygons?.length)) {
      return setError('Há uma região sem polígono. Desenhe ou remova essa região antes de salvar.');
    }

    setBusy(true);
    try {
      const id = ensureGarmentId();
      await saveGarment(id, { name: name.trim(), images, regions });
      await refreshGarments();
      setMessage('Peça salva no Firestore com sucesso.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openCustomer() {
    if (!garmentId) return setError('Salve a peça antes de abrir a tela do cliente.');
    const base = `${window.location.origin}${window.location.pathname}`;
    window.open(`${base}#/customizar/${garmentId}`, '_blank', 'noopener,noreferrer');
  }

  function switchView(nextView) {
    setView(nextView);
    setSelectedRegionId(null);
    setMode('idle');
    setZoom(1);
  }

  return (
    <main className="app-shell admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Painel interno</p>
          <h1>{section === 'orders' ? 'Pedidos' : 'Editor de uniformes'}</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button button-secondary" to="/">Catálogo</Link>
          {section === 'editor' && <button className="button button-secondary" type="button" onClick={resetEditor}>Nova peça</button>}
          {section === 'editor' && <button className="button button-secondary" type="button" onClick={openCustomer}>Abrir como cliente</button>}
          {section === 'editor' && <button className="button button-primary" type="button" onClick={handleSave} disabled={busy}>Salvar</button>}
          {section === 'orders' && <button className="button button-secondary" type="button" onClick={refreshOrders} disabled={ordersLoading}>{ordersLoading ? 'Atualizando…' : 'Atualizar'}</button>}
          <button className="button button-ghost" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <nav className="panel admin-main-tabs" aria-label="Seções do painel">
        <button type="button" className={section === 'editor' ? 'active' : ''} onClick={() => setSection('editor')}>Peças</button>
        <button type="button" className={section === 'orders' ? 'active' : ''} onClick={openOrders}>Pedidos{orders.length > 0 && <span>{orders.length}</span>}</button>
      </nav>

      {section === 'orders' ? (
        <OrdersView
          orders={orders}
          loading={ordersLoading}
          error={ordersError}
          onRefresh={refreshOrders}
          onToggleCompleted={handleToggleOrder}
          onDelete={handleDeleteOrder}
          actionId={orderActionId}
        />
      ) : (
        <>
          <section className="panel garment-meta-bar">
            <label className="grow-field">Nome da peça<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Camisa Polo Refletiva" /></label>
            <label>Carregar existente
              <select value={garmentId} onChange={(event) => loadGarment(event.target.value)}>
                <option value="">Nova peça</option>
                {garments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="garment-id-box"><span>ID</span><code>{garmentId || 'será criado automaticamente'}</code></div>
          </section>

          {(message || error) && <div className={error ? 'notice notice-error' : 'notice notice-success'}>{error || message}</div>}

          <div className="view-toolbar panel">
            <div className="segmented view-type-tabs">
              <button type="button" className={view === 'front' ? 'active' : ''} onClick={() => switchView('front')}>Frente</button>
              <button type="button" className={view === 'back' ? 'active' ''} onClick={() => switchView('back')}>Costas</button>
              <button type="button" className={view === 'combined' ? 'active' : ''} onClick={() => switchView('combined')}>Frente + Costas</button>
            </div>
            <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleImageFile(event.target.files?.[0])} />
            <button className="button button-secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>Enviar foto: {VIEW_LABELS[view]}</button>
            <button className="button button-primary" type="button" onClick={() => setRegionDialogOpen(true)} disabled={!images[view]}>+ Nova região</button>
            <button className={`button ${mode === 'preview' ? 'button-success' : 'button-secondary'}`} type="button" onClick={() => setMode((value) => value === 'preview' ? 'idle' : 'preview')} disabled={!images[view]}>Pré-visualizar como cliente</button>
            <button className={`button ${mode === 'logoTest' ? 'button-success' : 'button-secondary'}`} type="button" onClick={() => setMode((value) => value === 'logoTest' ? 'idle' : 'logoTest')} disabled={!images[view]}>Testar logos</button>
            <div className="zoom-controls"><button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.1))}>+</button></div>
          </div>

          <section className="admin-layout">
            <RegionSidebar
              regions={regions}
              view={view}
              selectedRegionId={selectedRegionId}
              visibleIds={visibleIds}
              onSelect={(id) => { setSelectedRegionId(id); if (!isPreviewMode) setMode('edit'); }}
              onToggleVisible={toggleVisible}
              onReorder={reorderRegions}
              onUpdateRegion={updateRegion}
              onEdit={(id) => { setSelectedRegionId(id); setMode('edit'); }}
              onAddPart={(id) => { setSelectedRegionId(id); setMode('draw'); }}
            />

            <section className="panel canvas-panel editor-panel">
              <div className="canvas-toolbar">
                <span>{VIEW_LABELS[view]} · {mode === 'draw' ? 'Desenhando região' : mode === 'edit' ? 'Editando pontos' : mode === 'preview' ? 'Pré-visualização do cliente' : mode === 'logoTest' ? 'Testando logos' : 'Editor'}</span>
                {selectedRegion && <strong>{selectedRegion.label}</strong>}
              </div>
              {mode === 'logoTest' ? (
                <AdminLogoTester
                  garment={{ name, images, regions }}
                  view={view}
                  colorChoices={previewColors}
                  zoom={zoom}
                  setZoom={setZoom}
                  onRegionClick={(region) => setSelectedRegionId(region.id)}
                />
              ) : (
                <GarmentEditorCanvas
                  imageUrl={images[view]}
                  view={view}
                  regions={regions}
                  setRegions={setRegions}
                  selectedRegionId={selectedRegionId}
                  mode={mode}
                  visibleIds={visibleIds}
                  previewColors={previewColors}
                  onSelectRegion={(id) => setSelectedRegionId(id)}
                  onPolygonClosed={() => setMode('edit')}
                  zoom={zoom}
                  setZoom={setZoom}
                />
              )}
            </section>

            <aside className="panel inspector-panel">
              <h2>Propriedades</h2>
              {!selectedRegion && <p className="muted">Selecione uma região para editar suas propriedades.</p>}
              {selectedRegion && (
                <>
                  <label>Nome<input value={selectedRegion.label} onChange={(event) => updateRegion(selectedRegion.id, { label: event.target.value })} /></label>
                  <label>Cor padrão<input type="color" value={selectedRegion.defaultColor} onChange={(event) => updateRegion(selectedRegion.id, { defaultColor: event.target.value })} /></label>
                  {isPreviewMode && !selectedRegion.locked && <label>Cor no teste<input type="color" value={previewColors[selectedRegion.id] ?? selectedRegion.defaultColor} onChange={(event) => setPreviewColors((current) => ({ ...current, [selectedRegion.id]: event.target.value }))} /></label>}
                  {isPreviewMode && selectedRegion.locked && <div className="locked-note">🔒 Esta região está bloqueada para o cliente.</div>}
                  <div className="stats-grid"><div><span>Partes</span><strong>{selectedRegion.polygons?.length ?? 0}</strong></div><div><span>zIndex</span><strong>{selectedRegion.zIndex}</strong></div></div>
                  <button className="button button-secondary full-width" type="button" onClick={() => { setMode('draw'); }}>Adicionar outra parte</button>
                </>
              )}
            </aside>
          </section>
        </>
      )}

      {section === 'editor' && <NewRegionDialog open={regionDialogOpen} onClose={() => setRegionDialogOpen(false)} onCreate={createRegion} />}
    </main>
  );
}

export default function AdminPage() {
  return <AdminAuth>{({ logout }) => <AdminWorkspace logout={logout} />}</AdminAuth>;
}
