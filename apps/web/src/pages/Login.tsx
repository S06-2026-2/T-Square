import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Icone from '../components/Icone';
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
      navigate('/', { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Nao foi possivel entrar');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login">
      <section className="login-marca">
        <span className="marca-icone marca-icone-grande">
          <Icone nome="marca" tamanho={28} />
        </span>
        <h2>Gesso Manager</h2>
        <p>Obras, equipe e estoque da sua firma de gesso em um so lugar.</p>
        <ul>
          <li>
            <Icone nome="obras" /> Funil de obras do orcamento a conclusao
          </li>
          <li>
            <Icone nome="gesseiros" /> Vales, pagamentos e saldo de cada gesseiro
          </li>
          <li>
            <Icone nome="estoque" /> Materiais com alerta de reposicao
          </li>
        </ul>
      </section>

      <div className="login-area">
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
    </div>
  );
}
