import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import { auth } from './lib/api';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import Gesseiros from './pages/Gesseiros';
import Login from './pages/Login';
import Obras from './pages/Obras';

function RotaPrivada({ children }: { children: JSX.Element }) {
  return auth.estaLogado() ? children : <Navigate to="/login" replace />;
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
