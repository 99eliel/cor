import { isFirebaseConfigured } from '../lib/firebase';

export default function AdminPage() {
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
        </div>
      </header>

      {!isFirebaseConfigured && (
        <div className="notice">
          Firebase ainda não configurado. Preencha as variáveis VITE_FIREBASE_* para conectar Firestore e Storage.
        </div>
      )}

      <section className="admin-layout">
        <aside className="panel sidebar-panel">
          <div className="panel-heading">
            <h2>Regiões</h2>
            <span className="badge">0</span>
          </div>
          <p className="muted">As regiões cadastradas aparecerão aqui e poderão ser reordenadas por zIndex.</p>
        </aside>

        <section className="panel canvas-panel">
          <div className="canvas-toolbar">
            <span>Editor da peça</span>
            <div>
              <button type="button" className="icon-button" disabled>−</button>
              <button type="button" className="icon-button" disabled>+</button>
            </div>
          </div>
          <div className="canvas-placeholder">
            <strong>Nenhuma peça carregada</strong>
            <span>O editor de polígonos será conectado ao cadastro da peça nesta tela.</span>
          </div>
        </section>
      </section>
    </main>
  );
}
