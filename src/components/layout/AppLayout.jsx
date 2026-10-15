import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from '../common/Icon';
import CenteredDialog from '../common/CenteredDialog';
import { signOut } from '../../services/authService';

const links = [{ to: '/', label: 'Inicio', icon: 'home' }, { to: '/stock', label: 'Stock', icon: 'stock' }, { to: '/historial', label: 'Historial', icon: 'history' }];
export default function AppLayout() {
  const { pathname } = useLocation();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await signOut();
    } catch {
      setError('No pudimos cerrar la sesión. Volvé a intentar.');
    } finally {
      setPending(false);
    }
  }
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return <div className="app-layout">
    <nav className="app-navigation" aria-label="Navegación principal"><div className="app-navigation-inner">
      <span className="navigation-brand"><Icon name="dish" />El Morena</span>
      <div className="navigation-links">{links.map((link) => <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}><span className="navigation-icon"><Icon name={link.icon} /></span><span>{link.label}</span></NavLink>)}</div>
      <button type="button" className="navigation-logout" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => { setError(''); setConfirmLogout(true); }}><Icon name="logout" /><span>Cerrar sesión</span></button>
    </div></nav>
    {confirmLogout && <CenteredDialog title="Confirmar cierre de sesión" busy={pending} onClose={() => setConfirmLogout(false)}>
      <span className="libreta-icon-badge"><Icon name="logout" /></span>
      <h2 className="text-3xl font-semibold">¿Querés cerrar sesión?</h2>
      <p className="my-5 text-lg text-stone-600">Podrás volver a ingresar con tu correo y contraseña.</p>
      {error && <p role="alert" className="mb-5 text-lg text-red-800">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" autoFocus className="libreta-secondary" disabled={pending} onClick={() => setConfirmLogout(false)}>Cancelar</button>
        <button type="button" className="libreta-button" disabled={pending} onClick={logout}>{pending ? 'Cerrando sesión…' : 'Sí, cerrar sesión'}</button>
      </div>
    </CenteredDialog>}
    <Outlet />
  </div>;
}
