import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAuth from '../components/AdminAuth';
import AdminLogoTester from '../components/AdminLogoTester';
import GarmentEditorCanvas from '../components/GarmentEditorCanvas';
import NewRegionDialog from '../components/NewRegionDialog';
import OrderQuoteBuilder from '../components/OrderQuoteBuilder';
import MartinpelBrand from '../components/MartinpelBrand';
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

function OrdersView({ orders, loading, error, onRefresh }) {
  const [actionId, setActionId] = useState('');
  const [actionError, setActionError] = useState('');
  const completedCount = orders.filter((order) => order.status === 'completed').length;
  const pendingCount = orders.length - completedCount;

  async function toggleCompleted(order) {
    const completed = order.status === 'completed';
    setActionId(order.id);
    setActionError('');
    try {
      await setOrderCompleted(order.id, !completed);
      await onRefresh();
    } catch (err) {
      setActionError(`Não foi possível atualizar o pedido: ${err.message}`);
    } finally {
      setActionId('');
    }
  }

  async function removeOrder(order) {
    const customer = order.customerName ? ` de ${order.customerName}` : '';
    const confirmed = window.confirm(`Excluir permanentemente o pedido${customer}? Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    setActionId(order.id);
    setActionError('');
    try {
      await deleteOrder(order.id);
      await onRefresh();
    } catch (err) {
      setActionError(`Não foi possível excluir o pedido: ${err.message}`);
    } finally {
      setActionId('');
    }
  }

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

      {(error || actionError) && <div className="notice notice-error">{actionError || error}</div>}
      {!error && !actionError && loading && orders.length === 0 && <div className="panel orders-empty">Carregando pedidos…</div>}
      {!error && !actionError && !loading && orders.length === 0 && <div className="panel orders-empty">Nenhum pedido recebido ainda.</div>}

      <div className="orders-grid">
        {orders.map((order) => {
          let finalImages = Object.entries(order.finalImages ?? {}).filter(([, url]) => Boolean(url));
          if (finalImages.length === 0 && order.finalImageUrl) finalImages = [['final', order.finalImageUrl]];
          const whatsappLink = whatsappHref(order.whatsapp);
          const vectorFiles = (order.logos ?? []).filter((logo) => logo.sourceType === 'pdf' && logo.sourceUrl);
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

              {completed && order.completedAt && <div className="order-completed-note">Concluído em {formatOrderDate(order.completedAt)}</div>}

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

              {vectorFiles.length > 0 && (
                <div className="order-vector-files">
                  <div className="order-vector-title">
                    <span>Arquivos originais para produção</span>
                    <strong>{vectorFiles.length} PDF(s) vetorial(is)</strong>
                  </div>
                  <div className="order-vector-list">
                    {vectorFiles.map((logo, index) => (
                      <a href={logo.sourceUrl} target="_blank" rel="noreferrer" key={logo.id || `${order.id}-vector-${index}`}>
                        <span className="order-vector-icon">PDF</span>
                        <span>
                          <strong>{logo.sourceName || `Logo vetorial ${index + 1}`}</strong>
                          <small>{logo.sourcePageCount > 1 ? `Prévia usando página ${logo.sourcePage || 1} de ${logo.sourcePageCount}` : 'Arquivo vetorial original'}</small>
                        </span>
                        <b>Abrir original ↗</b>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <OrderQuoteBuilder order={order} disabled={isWorking || loading} onSaved={onRefresh} />

              <div className="order-actions">
                <button
                  className={`button ${completed ? 'button-secondary' : 'button-success'}`}
                  type="button"
                  disabled={isWorking || loading}
                  onClick={() => toggleCompleted(order)}
                >
                  {isWorking ? 'Salvando…' : completed ? 'Reabrir pedido' : 'Marcar como concluído'}
                </button>
                <button
                  className="button order-delete-button"
                  type="button"
                  disabled={isWorking || loading}
                  onClick={() => removeOrder(order)}
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

function AdminDashboard({
  garments,
  orders,
  ordersLoading,
  onAddGarment,
  onManageGarments,
  onOpenOrders,
}) {
  const completed = orders.filter((order) => order.status === 'completed').length;
  const pending = orders.length - completed;
  const latestOrders = orders.slice(0, 3);

  return (
    <section className="admin-dashboard">
      <div className="dashboard-hero panel">
        <div>
          <p className="eyebrow">Central de gestão</p>
          <h2>O que você quer fazer?</h2>
          <p>Cadastre peças para o catálogo, acompanhe os pedidos dos clientes e avance cada solicitação até o orçamento e a produção.</p>
        </div>
        <div className="dashboard-hero-mark">GP</div>
      </div>

      <div className="dashboard-actions-grid">
        <button className="dashboard-action-card is-primary" type="button" onClick={onAddGarment}>
          <span className="dashboard-action-icon">＋</span>
          <span className="dashboard-action-copy">
            <strong>Adicionar peça ao catálogo</strong>
            <small>Cadastre uma nova peça, envie as imagens e defina as áreas personalizáveis.</small>
          </span>
          <span className="dashboard-action-arrow">→</span>
        </button>

        <button className="dashboard-action-card" type="button" onClick={onManageGarments}>
          <span className="dashboard-action-icon">▦</span>
          <span className="dashboard-action-copy">
            <strong>Gerenciar catálogo</strong>
            <small>Abra peças existentes para editar imagens, regiões, cores e configurações.</small>
          </span>
          <span className="dashboard-action-arrow">→</span>
        </button>

        <button className="dashboard-action-card" type="button" onClick={onOpenOrders}>
          <span className="dashboard-action-icon">◎</span>
          <span className="dashboard-action-copy">
            <strong>Ver pedidos</strong>
            <small>Acompanhe clientes, artes finais, orçamentos e andamento dos pedidos.</small>
          </span>
          <span className="dashboard-action-arrow">→</span>
        </button>
      </div>

      <div className="dashboard-stats-grid">
        <article className="panel dashboard-stat">
          <span>Peças no catálogo</span>
          <strong>{garments.length}</strong>
          <small>disponíveis para personalização</small>
        </article>
        <article className="panel dashboard-stat is-pending">
          <span>Pedidos pendentes</span>
          <strong>{ordersLoading ? '…' : pending}</strong>
          <small>aguardando atendimento</small>
        </article>
        <article className="panel dashboard-stat is-completed">
          <span>Pedidos concluídos</span>
          <strong>{ordersLoading ? '…' : completed}</strong>
          <small>finalizados no sistema</small>
        </article>
      </div>

      <section className="panel dashboard-recent">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">Atividade recente</p>
            <h3>Últimos pedidos</h3>
          </div>
          <button className="button button-secondary" type="button" onClick={onOpenOrders}>Ver todos</button>
        </div>

        {ordersLoading && orders.length === 0 && <div className="dashboard-recent-empty">Carregando pedidos…</div>}
        {!ordersLoading && latestOrders.length === 0 && <div className="dashboard-recent-empty">Ainda não há pedidos recebidos.</div>}

        {latestOrders.length > 0 && (
          <div className="dashboard-recent-list">
            {latestOrders.map((order) => {
              const done = order.status === 'completed';
              return (
                <button type="button" className="dashboard-recent-order" key={order.id} onClick={onOpenOrders}>
                  <div>
                    <strong>{order.customerName || 'Cliente não informado'}</strong>
                    <span>{order.garmentName || order.garmentId || 'Peça não identificada'}</span>
                  </div>
                  <div className="dashboard-recent-order-meta">
                    <span className={`order-status ${done ? 'is-completed' : 'is-pending'}`}>{done ? 'Concluído' : 'Pendente'}</span>
                    <small>{formatOrderDate(order.createdAt)}</small>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function AdminWorkspace({ logout }) {
  const fileInputRef = useRef(null);
  const [section, setSection] = useState('dashboard');
  const [garments, setGarments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
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
    refreshOrders();
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

  function openOrders() {
    setSection('orders');
    refreshOrders();
  }

  function openDashboard() {
    setSection('dashboard');
    refreshGarments();
    refreshOrders();
  }

  function openCatalog() {
    setSection('editor');
  }

  function addNewGarment() {
    resetEditor();
    setSection('editor');
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
      <div className="martinpel-appbar admin-brandbar">
        <MartinpelBrand compact subtitle="Uniformes • EPI's • Produção" />
        <div className="martinpel-appbar-meta">
          <span className="martinpel-system-pill">Gestão de Personalização</span>
          <small>Peças • Pedidos • Orçamentos</small>
        </div>
      </div>

      <header className="admin-header martinpel-page-header">
        <div className="page-heading-block">
          <p className="eyebrow">{section === 'dashboard' ? 'Painel administrativo' : section === 'orders' ? 'Gestão comercial' : 'Catálogo de produtos'}</p>
          <h1>{section === 'dashboard' ? 'Visão geral' : section === 'orders' ? 'Pedidos e orçamentos' : 'Gerenciar catálogo'}</h1>
          <p className="page-subtitle">
            {section === 'dashboard'
              ? 'Central de controle da Gestão de Personalização Martinpel.'
              : section === 'orders'
                ? 'Acompanhe solicitações, gere orçamentos e controle o andamento de cada pedido.'
                : 'Adicione novas peças ou edite produtos já disponíveis para os clientes.'}
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="button button-secondary" to="/">Ver catálogo público</Link>
          {section !== 'dashboard' && <button className="button button-secondary" type="button" onClick={openDashboard}>Visão geral</button>}
          {section === 'editor' && <button className="button button-secondary" type="button" onClick={addNewGarment}>Adicionar peça</button>}
          {section === 'editor' && <button className="button button-secondary" type="button" onClick={openCustomer}>Abrir como cliente</button>}
          {section === 'editor' && <button className="button button-primary" type="button" onClick={handleSave} disabled={busy}>Salvar peça</button>}
          {section === 'orders' && <button className="button button-secondary" type="button" onClick={refreshOrders} disabled={ordersLoading}>{ordersLoading ? 'Atualizando…' : 'Atualizar pedidos'}</button>}
          <button className="button button-ghost" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <nav className="panel admin-main-tabs admin-structure-tabs" aria-label="Seções do painel">
        <button type="button" className={section === 'dashboard' ? 'active' : ''} onClick={openDashboard}>Visão geral</button>
        <button type="button" className={section === 'editor' ? 'active' : ''} onClick={openCatalog}>Catálogo <span>{garments.length}</span></button>
        <button type="button" className={section === 'orders' ? 'active' : ''} onClick={openOrders}>Pedidos{orders.length > 0 && <span>{orders.length}</span>}</button>
      </nav>

      {section === 'dashboard' ? (
        <AdminDashboard
          garments={garments}
          orders={orders}
          ordersLoading={ordersLoading}
          onAddGarment={addNewGarment}
          onManageGarments={openCatalog}
          onOpenOrders={openOrders}
        />
      ) : section === 'orders' ? (
        <OrdersView orders={orders} loading={ordersLoading} error={ordersError} onRefresh={refreshOrders} />
      ) : (
        <>
          <section className="catalog-admin-intro panel">
            <div>
              <p className="eyebrow">Catálogo</p>
              <h2>{garmentId ? 'Editar peça do catálogo' : 'Adicionar peça ao catálogo'}</h2>
              <p>{garmentId ? 'Faça as alterações necessárias e salve para atualizar a peça disponível aos clientes.' : 'Preencha os dados, envie a imagem e marque todas as regiões que o cliente poderá personalizar.'}</p>
            </div>
            <button className="button button-primary" type="button" onClick={addNewGarment}>+ Nova peça</button>
          </section>

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
              <button type="button" className={view === 'back' ? 'active' : ''} onClick={() => switchView('back')}>Costas</button>
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
