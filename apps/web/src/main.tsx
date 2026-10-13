import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Home } from './Home';
import { TvLobby } from './tv/TvLobby';
import { PlayJoin } from './play/PlayJoin';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tv" element={<TvLobby />} />
        <Route path="/play" element={<PlayJoin />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
