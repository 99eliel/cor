import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import MartinpelBrand from './MartinpelBrand';
import '../admin.css';

export default function AdminAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (nextUser) => {
    setUser(nextUser);
    setAllowed(false);
    try {
      if (nextUser) {
        const snapshot = await getDoc(doc(db, 'admins', nextUser.uid));
        setAllowed(snapshot.exists() && snapshot.data()?.role === 'admin');
      }
    } catch {
      setAllowed(false);
    } finally {
      setReady(true);
    }
  }), []);

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('Não foi possível entrar. Confira e-mail e senha.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <main className="loading-screen">Verificando acesso…</main>;

  if (!user) {
    return (
      <main className="login-shell">
        <form className="panel login-card" onSubmit={login}>
          <div className="login-brand-block"><MartinpelBrand subtitle="Acesso administrativo" /></div>
          <p className="eyebrow">Área restrita</p>
          <h1>Gestão de Personalização</h1>
          <p className="muted">Acesse a gestão de peças, pedidos, orçamentos e produção.</p>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {error && <div className="inline-error">{error}</div>}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="login-shell">
        <section className="panel login-card">
          <div className="login-brand-block"><MartinpelBrand subtitle="Acesso administrativo" /></div>
          <p className="eyebrow">Acesso negado</p>
          <h1>Conta sem permissão</h1>
          <p className="muted">O documento <code>admins/{'{uid}'}</code> precisa existir e conter <code>role: "admin"</code>.</p>
          <code className="uid-box">{user.uid}</code>
          <button className="button button-secondary" type="button" onClick={() => signOut(auth)}>Sair</button>
        </section>
      </main>
    );
  }

  return children({ user, logout: () => signOut(auth) });
}
