import { useStore } from '../stores/appStore';
import { PrerequisitesView } from './views/PrerequisitesView';
import { WaitingView } from './views/WaitingView';
import { ConnectedView } from './views/ConnectedView';
import { ScanningView } from './views/ScanningView';
import { ReadyView } from './views/ReadyView';
import { CopyingView } from './views/CopyingView';
import { PausedView } from './views/PausedView';
import { CompletedView } from './views/CompletedView';

export function MainArea() {
  const { phase } = useStore();

  const views: Record<string, React.ReactNode> = {
    prerequisites: <PrerequisitesView />,
    waiting: <WaitingView />,
    connected: <ConnectedView />,
    scanning: <ScanningView />,
    ready: <ReadyView />,
    copying: <CopyingView />,
    paused: <PausedView />,
    completed: <CompletedView />,
  };

  return (
    <main className="flex-1 overflow-y-auto p-6">
      {views[phase] ?? <WaitingView />}
    </main>
  );
}
