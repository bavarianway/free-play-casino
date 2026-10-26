import { useHashRoute } from './hooks';
import { AgeGate, Footer, Header, SessionMonitor } from './components/Shell';
import { useCasino } from './store';
import { Lobby } from './pages/Lobby';
import { BlackjackPage } from './pages/Blackjack';
import { SlotsPage } from './pages/Slots';
import { RoulettePage } from './pages/Roulette';
import { CrashPage } from './pages/Crash';
import { ClustersPage } from './pages/Clusters';
import { FairPage } from './pages/Fair';
import { ResponsiblePage } from './pages/Responsible';

function Page({ route }: { route: string }) {
  switch (route) {
    case '/blackjack': return <BlackjackPage />;
    case '/slots': return <SlotsPage />;
    case '/roulette': return <RoulettePage />;
    case '/crash': return <CrashPage />;
    case '/clusters': return <ClustersPage />;
    case '/fair': return <FairPage />;
    case '/responsible': return <ResponsiblePage />;
    default: return <Lobby />;
  }
}

export function App() {
  const route = useHashRoute();
  const { age } = useCasino();
  return (
    <div className="app">
      <Header route={route} />
      <main className="main" aria-hidden={age !== 'ok'}>
        {age === 'ok' ? <Page key={route} route={route} /> : null}
      </main>
      <Footer />
      <AgeGate />
      <SessionMonitor />
    </div>
  );
}
