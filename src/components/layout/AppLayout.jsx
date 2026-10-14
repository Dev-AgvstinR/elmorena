import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Icon from '../common/Icon';

const links = [{ to: '/', label: 'Inicio', icon: 'home' }, { to: '/stock', label: 'Stock', icon: 'stock' }, { to: '/historial', label: 'Historial', icon: 'history' }];
export default function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return <div className="app-layout">
    <nav className="app-navigation" aria-label="Navegación principal"><div className="app-navigation-inner">
      <span className="navigation-brand"><Icon name="dish" />El Morena</span>
      <div className="navigation-links">{links.map((link) => <NavLink key={link.to} to={link.to} end={link.to === '/'} className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}><span className="navigation-icon"><Icon name={link.icon} /></span><span>{link.label}</span></NavLink>)}</div>
    </div></nav>
    <Outlet />
  </div>;
}
