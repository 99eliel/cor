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

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;

      setAllowed(false);

      if (!nextUser) {
        setUser(null);
        setReady(true);
        return;
      }

      // O catálogo usa autenticação anônima para pedidos.
      // Essa sessão nunca deve ser tratada como tentativa de acesso administrativo.
      if (nextUser.isAnonymous) {
        try {
          await signOut(auth);
        } catch {
          // Mesmo que o signOut falhe, não exibimos a sessão anônima como conta admin.
        }

        if (active) {
          setUser(null);
          setAllowed(false);
          setReady(true);
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, 'admins', nextUser.uid));
        const isAdmin = snapshot.exists() && snapshot.data()?.role === 'admin';

        if (isAdmin) {
          if (active) {
            setUser(nextUser);
            setAllowed(true);
            setError('');
            setReady(true);
          }
          return;
        }

        await signOut(auth);

        if (active) {
          setUser(null);
          setAllowed(false);
          setError('Esta conta não possui acesso administrativo.');
          setReady(true);
        }
      } catch {
        try {
          await signOut(auth);
        } catch {
          // Mantém o formulário disponível mesmo se houver falha ao encerrar a sessão.
        }

        if (active) {
          setUser(null);
          setAllowed(false);
          setError('Não foi possível validar o acesso administrativo. Tente novamente.');
          setReady(true);
        }
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

  if (!user || !allowed) {
    return (
      <main className="login-shell">
        <form className="panel login-card" onSubmit={login}>
          <div className="login-brand-block"><MartinpelBrand subtitle="Acesso administrativo" /></div>
          <p className="eyebrow">Área administrativa</p>
          <h1>Gestão de Personalização</h1>
          <p className="muted">Entre com seu e-mail e senha para acessar o painel da Martinpel.</p>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </main>
    );
  }

  return children({ user, logout: () => signOut(auth) });
}
