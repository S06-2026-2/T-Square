import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { auth } from '../lib/api';
import { iniciais } from '../lib/formato';
import { encerrarSessao } from '../lib/sessao';
import BotaoInstalar from './BotaoInstalar';
import Icone, { type NomeIcone } from './Icone';
import IndicadorConexao from './IndicadorConexao';

/** rotulo: sidebar do desktop; rotuloCurto: barra inferior do celular (<= 900px), via CSS. */
const abas: Array<{ para: string; rotulo: string; rotuloCurto: string; icone: NomeIcone }> = [
  { para: '/dashboard', rotulo: 'Visao geral', rotuloCurto: 'Geral', icone: 'painel' },
  { para: '/obras', rotulo: 'Obras', rotuloCurto: 'Obras', icone: 'obras' },
  { para: '/gesseiros', rotulo: 'Gesseiros', rotuloCurto: 'Equipe', icone: 'gesseiros' },
  { para: '/estoque', rotulo: 'Estoque', rotuloCurto: 'Estoque', icone: 'estoque' },
];

export default function Layout() {
  const navigate = useNavigate();
  const usuario = auth.getUsuario();
  const nome: string = usuario?.nome ?? '';

  async function sair() {
    await encerrarSessao();
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
              aria-label={aba.rotulo}
            >
              <Icone nome={aba.icone} />
              <span className="rotulo">{aba.rotulo}</span>
              <span className="rotulo-curto">{aba.rotuloCurto}</span>
            </NavLink>
          ))}
        </nav>

        <div className="usuario">
          <IndicadorConexao />
          <span className="avatar">{iniciais(nome) || '?'}</span>
          <span className="usuario-nome">{nome}</span>
          <BotaoInstalar />
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
