import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import App from './App';
import { theme } from './theme';
import './global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={theme}>
      <App />
    </FluentProvider>
  </React.StrictMode>
);
