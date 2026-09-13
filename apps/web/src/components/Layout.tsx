import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { auth } from '../lib/api';

const abas = [
  { para: '/obras', rotulo: 'Obras' },
  { para: '/gesseiros', rotulo: 'Gesseiros' },
  { para: '/estoque', rotulo: 'Estoque' },
];

export default function Layout() {
  const navigate = useNavigate();
  const usuario = auth.getUsuario();

  function sair() {
    auth.logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <header className="topo">
        <strong className="marca">Gesso Manager</strong>
        <nav className="nav">
          {abas.map((aba) => (
            <NavLink
              key={aba.para}
              to={aba.para}
              className={({ isActive }) => (isActive ? 'nav-link ativo' : 'nav-link')}
            >
              {aba.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="usuario">
          <span>{usuario?.nome ?? ''}</span>
          <button type="button" className="btn-texto" onClick={sair}>
            Sair
          </button>
        </div>
      </header>

      <main className="conteudo">
        <Outlet />
      </main>
    </div>
  );
}
