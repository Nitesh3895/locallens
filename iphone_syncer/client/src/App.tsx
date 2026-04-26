import { useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './stores/appStore';
import { api } from './lib/api';
import { Header } from './components/Header';
import { LeftPanel } from './components/LeftPanel';
import { MainArea } from './components/MainArea';
import { ActivityLog } from './components/ActivityLog';

export default function App() {
  useWebSocket();
  const { setPrerequisites, setPhase, phase } = useStore();

  useEffect(() => {
    api.prerequisites()
      .then(({ prerequisites, ready }) => {
        setPrerequisites(prerequisites);
        if (ready && phase === 'prerequisites') {
          setPhase('waiting');
        }
      })
      .catch(() => {
        // Server not running yet
      });
  }, [setPrerequisites, setPhase, phase]);

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 flex min-h-0">
        <LeftPanel />
        <MainArea />
      </div>
      <ActivityLog />
    </div>
  );
}
