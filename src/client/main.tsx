import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import { App } from './app/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
