import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { auth } from './lib/api';
import { limparCacheApi } from './lib/sessao';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import Gesseiros from './pages/Gesseiros';
import Login from './pages/Login';
import Obras from './pages/Obras';

/**
 * Sem token não há logout a fazer, mas o cache de dados de uma sessão anterior (token apagado à
 * mão, aba antiga) não pode sobrar para o próximo login (AD-010). Limpa num efeito, nunca no render.
 */
function RotaPrivada({ children }: { children: JSX.Element }) {
  const logado = auth.estaLogado();

  useEffect(() => {
    if (!logado) void limparCacheApi();
  }, [logado]);

  return logado ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RotaPrivada>
            <Layout />
          </RotaPrivada>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/obras" element={<Obras />} />
        <Route path="/gesseiros" element={<Gesseiros />} />
        <Route path="/estoque" element={<Estoque />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
