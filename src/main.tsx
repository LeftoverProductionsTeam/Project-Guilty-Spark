import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const DirectorWindow=React.lazy(()=>import('./components/DirectorWindow'));
import './directorWindow.css';
import './styles.css';
import './viewport.css';
import './darkGlow.css';
import './workbenchCompact.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get('director')?<React.Suspense fallback={<p>Opening Recording Director…</p>}><DirectorWindow projectId={new URLSearchParams(location.search).get('director')!}/></React.Suspense>:<App />}
  </React.StrictMode>,
);
