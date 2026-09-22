import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import MartinpelBrand from './MartinpelBrand';
import '../admin.css';

export default function StaffAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;

      if (!nextUser || nextUser.isAnonymous) {
        if (nextUser?.isAnonymous) {
          try { await signOut(auth); } catch {}
        }
        if (active) {
          setUser(null);
          setIsAdmin(false);
          setReady(true);
        }
        return;
      }

      let admin = false;
      try {
        const snapshot = await getDoc(doc(db, 'admins', nextUser.uid));
        admin = snapshot.exists() && snapshot.data()?.role === 'admin';
      } catch {
        admin = false;
      }

      if (active) {
        setUser(nextUser);
        setIsAdmin(admin);
        setError('');
        setReady(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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
        <form className="panel login-card staff-login-card" onSubmit={login}>
          <div className="login-brand-block"><MartinpelBrand subtitle="Acesso interno" /></div>
          <p className="eyebrow">Equipe Martinpel</p>
          <h1>Gestão de Personalização</h1>
          <p className="muted">Entre com seu e-mail e senha para acessar o catálogo interno e montar pedidos.</p>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar no sistema'}</button>
        </form>
      </main>
    );
  }

  return children({ user, isAdmin, logout: () => signOut(auth) });
}
