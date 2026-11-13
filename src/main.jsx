import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { installApiBase } from './lib/apiBase';
import './index.css';

// Route every relative /api request to VITE_API_BASE_URL when the frontend is
// hosted separately from the backend (Vercel / Netlify / any static host).
installApiBase();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
