import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { auth } from '../lib/api';
import { iniciais } from '../lib/formato';
import Icone, { type NomeIcone } from './Icone';

const abas: Array<{ para: string; rotulo: string; icone: NomeIcone }> = [
  { para: '/dashboard', rotulo: 'Visao geral', icone: 'painel' },
  { para: '/obras', rotulo: 'Obras', icone: 'obras' },
  { para: '/gesseiros', rotulo: 'Gesseiros', icone: 'gesseiros' },
  { para: '/estoque', rotulo: 'Estoque', icone: 'estoque' },
];

export default function Layout() {
  const navigate = useNavigate();
  const usuario = auth.getUsuario();
  const nome: string = usuario?.nome ?? '';

  function sair() {
    auth.logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <span className="marca-icone">
            <Icone nome="marca" tamanho={20} />
          </span>
          <span className="marca-texto">
            <strong>Gesso Manager</strong>
            <small>Gestao de obras</small>
          </span>
        </div>

        <nav className="nav">
          {abas.map((aba) => (
            <NavLink
              key={aba.para}
              to={aba.para}
              className={({ isActive }) => (isActive ? 'nav-link ativo' : 'nav-link')}
            >
              <Icone nome={aba.icone} />
              <span>{aba.rotulo}</span>
            </NavLink>
          ))}
        </nav>

        <div className="usuario">
          <span className="avatar">{iniciais(nome) || '?'}</span>
          <span className="usuario-nome">{nome}</span>
          <button type="button" className="btn-sair" onClick={sair} title="Sair">
            <Icone nome="sair" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
