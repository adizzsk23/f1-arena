import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { inputManager } from './input/instance';
import { useApp } from './store';
import { DriveView } from './ui/DriveView';
import { Rebind } from './ui/Rebind';
import { StartScreen } from './ui/StartScreen';

inputManager.attach();

function App() {
  const { screen, showRebind, setShowRebind } = useApp();
  return (
    <div className="relative h-full w-full">
      {screen === 'start' ? <StartScreen /> : <DriveView />}
      {showRebind && <Rebind onClose={() => setShowRebind(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
