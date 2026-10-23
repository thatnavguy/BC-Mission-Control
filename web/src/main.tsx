import React from 'react';
import ReactDOM from 'react-dom/client';
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={window.matchMedia('(prefers-color-scheme: dark)').matches ? webDarkTheme : webLightTheme}>
      <App />
    </FluentProvider>
  </React.StrictMode>
);
