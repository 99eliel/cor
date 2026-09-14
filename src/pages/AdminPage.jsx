import AdminAuth from '../components/AdminAuth';

function AdminWorkspace({ logout }) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Painel interno</p>
          <h1>Cadastro de peças</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button button-secondary" disabled>Frente</button>
          <button type="button" className="button button-secondary" disabled>Costas</button>
          <button type="button" className="button button-primary" disabled>Nova região</button>
          <button type="button" className="button button-ghost" onClick={logout}>Sair</button>
        </div>
      </header>

      <div className="notice">Firebase conectado. O próximo passo do editor será liberado após autorizar o primeiro UID na coleção admins.</div>

      <section className="admin-layout">
        <aside className="panel sidebar-panel">
          <div className="panel-heading"><h2>Regiões</h2><span className="badge">0</span></div>
          <p className="muted">As regiões aparecerão aqui em ordem de zIndex.</p>
        </aside>
        <section className="panel canvas-panel">
          <div className="canvas-toolbar"><span>Editor da peça</span></div>
          <div className="canvas-placeholder">
            <strong>Admin autenticado</strong>
            <span>Cadastro de imagens e editor de polígonos entram nesta área.</span>
          </div>
        </section>
      </section>
    </main>
  );
}

export default function AdminPage() {
  return <AdminAuth>{({ logout }) => <AdminWorkspace logout={logout} />}</AdminAuth>;
}
