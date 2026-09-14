import { useParams } from 'react-router-dom';
import { isFirebaseConfigured } from '../lib/firebase';

export default function CustomizerPage() {
  const { garmentId } = useParams();

  return (
    <main className="app-shell customer-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Customização</p>
          <h1>Monte seu uniforme</h1>
        </div>
      </header>

      {!isFirebaseConfigured && (
        <div className="notice">
          Firebase ainda não configurado. Assim que as credenciais forem adicionadas, esta tela carregará a peça pelo garmentId.
        </div>
      )}

      <section className="customer-layout">
        <section className="panel canvas-panel customer-canvas-panel">
          <div className="canvas-placeholder">
            <strong>{garmentId ? `Peça: ${garmentId}` : 'Nenhuma peça selecionada'}</strong>
            <span>
              {garmentId
                ? 'A imagem base, recolorização por regiões e a camada Fabric.js serão renderizadas aqui.'
                : 'Abra uma URL no formato #/customizar/ID_DA_PECA.'}
            </span>
          </div>
        </section>

        <aside className="panel customer-tools">
          <h2>Personalização</h2>
          <p className="muted">Selecione uma região da peça para alterar a cor e adicionar a logo.</p>
          <button type="button" className="button button-primary" disabled>Enviar logo</button>
          <button type="button" className="button button-success" disabled>Finalizar pedido</button>
        </aside>
      </section>
    </main>
  );
}
