import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export default function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const updateSW = useRef(null);
  const installPrompt = useRef(null);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallable = (event) => {
      event.preventDefault();
      installPrompt.current = event;
      setCanInstall(true);
    };
    const onInstalled = () => { installPrompt.current = null; setCanInstall(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstallable);
    window.addEventListener('appinstalled', onInstalled);
    updateSW.current = registerSW({ onNeedRefresh: () => setUpdateAvailable(true) });
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstallable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt.current) return;
    await installPrompt.current.prompt();
    installPrompt.current = null;
    setCanInstall(false);
  }

  if (online && !updateAvailable && !canInstall) return null;
  return <div className="pwa-status" role="status">
    {!online && <p><strong>Sin conexión.</strong> Conectate a internet para consultar o guardar pedidos.</p>}
    {canInstall && <div className="flex flex-wrap items-center gap-3">
      <p>Podés instalar El Morena en este dispositivo.</p>
      <button type="button" className="libreta-secondary" onClick={install}>Instalar app</button>
      <button type="button" className="text-sm underline" onClick={() => setCanInstall(false)}>Ahora no</button>
    </div>}
    {updateAvailable && <div className="flex flex-wrap items-center gap-3">
      <p>Hay una versión nueva de El Morena.</p>
      <button type="button" className="libreta-secondary" onClick={() => updateSW.current?.(true)}>Actualizar app</button>
    </div>}
  </div>;
}
