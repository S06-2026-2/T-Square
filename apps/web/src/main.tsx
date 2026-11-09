import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { iniciarCapturaInstalacao } from './lib/instalacao';
import { registrarSw } from './pwa/registrar-sw';
import './index.css';

// Antes do render: o `beforeinstallprompt` pode disparar cedo e não se repete (PWA-05).
iniciarCapturaInstalacao();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA-03/04: só o build de produção registra o service worker.
void registrarSw({ prod: import.meta.env.PROD });
