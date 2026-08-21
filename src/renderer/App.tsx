import { useEffect, useState } from 'react';
import type { AppPaths, AppStatus } from '@shared/types/ipc';

interface ShellState {
  paths: AppPaths | null;
  status: AppStatus | null;
  nodeAccessible: boolean;
  requireAccessible: boolean;
  error: string | null;
}

interface RendererSecurityState {
  nodeAccessible: boolean;
  requireAccessible: boolean;
}

function getRendererSecurityState(): RendererSecurityState {
  const globalProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
  const nodeAccessible = typeof globalProcess !== 'undefined' && Boolean(globalProcess.versions?.node);
  const requireAccessible = typeof (globalThis as { require?: unknown }).require === 'function';

  return { nodeAccessible, requireAccessible };
}

export function App(): JSX.Element {
  const security = getRendererSecurityState();
  const [state, setState] = useState<ShellState>({
    paths: null,
    status: null,
    nodeAccessible: security.nodeAccessible,
    requireAccessible: security.requireAccessible,
    error: null,
  });

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [pathsResult, statusResult] = await Promise.all([
          window.api.app.getPaths(),
          window.api.app.getStatus(),
        ]);

        if (!pathsResult.ok) {
          setState((prev) => ({ ...prev, error: pathsResult.message ?? pathsResult.errorCode }));
          return;
        }

        if (!statusResult.ok) {
          setState((prev) => ({ ...prev, error: statusResult.message ?? statusResult.errorCode }));
          return;
        }

        setState({
          paths: pathsResult.data,
          status: statusResult.data,
          nodeAccessible: security.nodeAccessible,
          requireAccessible: security.requireAccessible,
          error: null,
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load application status',
        }));
      }
    }

    void load();
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Customer Accounting</h1>
        <p className="subtitle">Application shell — Phase 1 foundation</p>
      </header>

      <main className="app-main">
        {state.error && <div className="banner banner-error">{state.error}</div>}

        <section className="card">
          <h2>System Status</h2>
          {state.status ? (
            <dl className="status-list">
              <div>
                <dt>Version</dt>
                <dd>{state.status.version}</dd>
              </div>
              <div>
                <dt>Database connected</dt>
                <dd>{state.status.databaseConnected ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Database file exists</dt>
                <dd>{state.status.databaseExists ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Database path</dt>
                <dd className="mono">{state.status.databasePath}</dd>
              </div>
            </dl>
          ) : (
            <p>Loading status…</p>
          )}
        </section>

        <section className="card">
          <h2>Security Check</h2>
          <dl className="status-list">
            <div>
              <dt>Renderer Node.js access</dt>
              <dd className={state.nodeAccessible ? 'text-danger' : 'text-success'}>
                {state.nodeAccessible ? 'Exposed (unexpected)' : 'Blocked (expected)'}
              </dd>
            </div>
            <div>
              <dt>Renderer require() access</dt>
              <dd className={state.requireAccessible ? 'text-danger' : 'text-success'}>
                {state.requireAccessible ? 'Exposed (unexpected)' : 'Blocked (expected)'}
              </dd>
            </div>
          </dl>
        </section>

        {state.paths && (
          <section className="card">
            <h2>User Data Paths</h2>
            <dl className="status-list">
              <div>
                <dt>User data</dt>
                <dd className="mono">{state.paths.userData}</dd>
              </div>
              <div>
                <dt>Images</dt>
                <dd className="mono">{state.paths.images}</dd>
              </div>
              <div>
                <dt>Logs</dt>
                <dd className="mono">{state.paths.logs}</dd>
              </div>
              <div>
                <dt>Backups</dt>
                <dd className="mono">{state.paths.backups}</dd>
              </div>
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}
