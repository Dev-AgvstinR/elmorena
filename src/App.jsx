import { useSession } from './hooks/useSession';
import Login from './components/auth/Login';
import AppLayout from './components/layout/AppLayout';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
const History = lazy(() => import('./pages/History'));
const Stock = lazy(() => import('./pages/Stock'));
const Home = lazy(() => import('./pages/Home'));

export default function App() {
  const { session, loading, error } = useSession();
  if (loading) return <main className="p-8 text-xl" role="status">Abriendo tu libreta…</main>;
  if (error) return <main className="p-8 text-xl"><p role="alert">No pudimos abrir la sesión. Revisá tu conexión.</p><button className="libreta-button mt-5" onClick={() => window.location.reload()}>Volver a intentar</button></main>;
  return session ? <BrowserRouter key={session.user.id}><Suspense fallback={<p role="status" className="p-8">Cargando pantalla…</p>}><Routes><Route element={<AppLayout />}><Route path="/" element={<Home userId={session.user.id} />} /><Route path="/stock" element={<Stock userId={session.user.id} />} /><Route path="/historial" element={<History userId={session.user.id} />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes></Suspense></BrowserRouter> : <Login />;
}
import { lazy, Suspense } from 'react';
