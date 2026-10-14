import { useSession } from './hooks/useSession';
import Login from './components/auth/Login';
import Home from './pages/Home';
import History from './pages/History';
import Stock from './pages/Stock';
import AppLayout from './components/layout/AppLayout';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

export default function App() {
  const { session, loading, error } = useSession();
  if (loading) return <main className="p-8 text-xl" role="status">Abriendo tu libreta…</main>;
  if (error) return <main className="p-8 text-xl"><p role="alert">No pudimos abrir la sesión. Revisá tu conexión.</p><button className="libreta-button mt-5" onClick={() => window.location.reload()}>Volver a intentar</button></main>;
  return session ? <BrowserRouter key={session.user.id}><Routes><Route element={<AppLayout />}><Route path="/" element={<Home userId={session.user.id} />} /><Route path="/stock" element={<Stock userId={session.user.id} />} /><Route path="/historial" element={<History userId={session.user.id} />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes></BrowserRouter> : <Login />;
}
