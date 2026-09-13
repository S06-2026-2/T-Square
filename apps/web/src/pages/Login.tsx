import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, auth } from '../lib/api';
import type { LoginResponse } from '../types';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@gesso.com');
  const [senha, setSenha] = useState('admin123');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const resposta = await api.post<LoginResponse>('/auth/login', { email, senha });
      auth.setToken(resposta.accessToken);
      auth.setUsuario(resposta.usuario);
      navigate('/obras', { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Nao foi possivel entrar');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={entrar}>
        <h1>Gesso Manager</h1>
        <p className="subtitulo">Entre para gerenciar obras, gesseiros e estoque.</p>

        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {erro && <p className="erro">{erro}</p>}

        <button type="submit" className="btn" disabled={carregando}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
