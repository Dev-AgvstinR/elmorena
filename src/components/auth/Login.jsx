import { useState } from 'react';
import { signIn, signUp } from '../../services/authService';
import Icon from '../common/Icon';

export default function Login() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [register, setRegister] = useState(false);
  const [notice, setNotice] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData(event.currentTarget);
    setError('');
    setNotice('');
    if (register && values.get('password') !== values.get('confirmPassword')) {
      setError('Las contraseñas no coinciden. Volvé a escribirlas.');
      return;
    }
    const form = event.currentTarget;
    setPending(true);
    try {
      const credentials = { email: values.get('email'), password: values.get('password') };
      if (register) {
        const data = await signUp(credentials);
        if (!data.session) {
          form.reset();
          setRegister(false);
          setNotice('Ingresá con tu correo y contraseña para continuar.');
        }
      } else {
        await signIn(credentials);
      }
    } catch (failure) {
      if (failure.code === 'weak_password') setError('La contraseña no cumple los requisitos. Probá una más larga con letras, números y símbolos.');
      else if (failure.code === 'signup_disabled') setError('El registro está deshabilitado en Supabase. Activá la creación de cuentas para continuar.');
      else if (failure.status === 429) setError('Hubo demasiados intentos. Esperá unos minutos y volvé a intentar.');
      else setError(register ? 'No pudimos crear la cuenta. Revisá los datos y tu conexión. Si ya tenés cuenta, elegí Ingresar.' : 'No pudimos ingresar. Revisá el correo, la contraseña y tu conexión.');
    } finally { setPending(false); }
  }
  return (
    <main className="min-h-screen px-5 py-12">
      <section className="mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-8">
        <span className="libreta-icon-badge"><Icon name="dish" /></span>
        <h1 className="text-3xl font-semibold">El Morena</h1>
        <h2 className="mt-5 text-2xl font-semibold">{register ? 'Crear cuenta' : 'Ingresar'}</h2>
        <p className="my-5 text-lg text-stone-600">{register ? 'Creá tu cuenta para empezar a guardar tus comidas.' : 'Ingresá para ver tus comidas. Tu sesión quedará guardada en este dispositivo.'}</p>
        <form key={register ? 'register' : 'login'} onSubmit={submit} className="space-y-5">
          <fieldset disabled={pending} className="space-y-5">
            <label className="block text-lg">Correo electrónico<input className="libreta-input" name="email" type="email" autoComplete="username" required /></label>
            <label className="block text-lg">Contraseña<input className="libreta-input" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} aria-describedby={register ? 'password-help' : undefined} required /></label>
            {register && <><p id="password-help" className="text-stone-600">Usá al menos 8 caracteres.</p><label className="block text-lg">Repetir contraseña<input className="libreta-input" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label></>}
          </fieldset>
          {error && <p role="alert" className="text-lg text-red-800">{error}</p>}
          {notice && <p role="status" className="text-lg text-green-900">{notice}</p>}
          <button disabled={pending} className="libreta-button w-full"><Icon name={register ? 'register' : 'login'} />{pending ? (register ? 'Creando cuenta…' : 'Ingresando…') : (register ? 'Crear cuenta' : 'Ingresar')}</button>
        </form>
        <button type="button" disabled={pending} className="libreta-secondary mt-5 w-full" onClick={() => { setRegister(!register); setError(''); setNotice(''); }}>{register ? 'Ya tengo cuenta · Ingresar' : 'Crear una cuenta'}</button>
      </section>
    </main>
  );
}
