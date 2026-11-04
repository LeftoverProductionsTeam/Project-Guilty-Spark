import React from 'react';
import ReactDOM from 'react-dom/client';
const App=React.lazy(()=>import('./App'));
const DesktopSpark=React.lazy(()=>import('./components/DesktopSpark'));
const DirectorWindow=React.lazy(()=>import('./components/DirectorWindow'));
import './directorWindow.css';
import './styles.css';
import './viewport.css';
import './darkGlow.css';
import './workbenchCompact.css';
const companion=new URLSearchParams(location.search).get('companion')==='1';
if(companion)document.documentElement.dataset.gsDesktopOrb='true';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={companion?null:<p role="status">Opening Spark…</p>}>
    {companion?<DesktopSpark/>:new URLSearchParams(location.search).get('director')?<DirectorWindow projectId={new URLSearchParams(location.search).get('director')!}/>:<App />}
    </React.Suspense>
  </React.StrictMode>,
);
