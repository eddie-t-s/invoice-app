import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Guard against third-party scripts/extensions that call mgt.clearMarks.
if (typeof window !== 'undefined') {
  window.mgt = window.mgt || {};
  if (typeof window.mgt.clearMarks !== 'function') {
    window.mgt.clearMarks = () => {};
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
