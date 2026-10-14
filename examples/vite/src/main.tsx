import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { App, AuthenticatedApp } from './App';
import './style.css';

const root = createRoot(document.getElementById('root')!);
const baseUrl = import.meta.env.VITE_TADORINO_BASE_URL as string | undefined;
const demo = import.meta.env.VITE_DEMO_MODE === 'true';
const fixture = import.meta.env.VITE_FIXTURE_MODE === 'true';
const domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;

if (!baseUrl || (demo && fixture) || (fixture && baseUrl !== 'http://127.0.0.1:3001') || (!demo && !fixture && (!domain || !clientId || !audience))) {
  root.render(<main className="configuration"><h1>タドリノ SDK</h1><p>examples/vite/.env.example を参考にローカル設定を用意してください。</p><p>公開SPAのClient IDを使用します。Client SecretやAccess TokenをVITE_変数へ入れないでください。</p></main>);
} else if (fixture) {
  root.render(<StrictMode><App baseUrl={baseUrl} mode="fixture" getAccessToken={async ({ signal }) => {
    const response = await fetch(`${baseUrl}/__fixture-token`, { signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('Local fixture unavailable.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('synthetic' in data) || data.synthetic !== true || !('token' in data) || typeof data.token !== 'string') throw new Error('Local fixture response rejected.');
    return data.token;
  }} /></StrictMode>);
} else if (demo) {
  root.render(<StrictMode><App baseUrl={baseUrl} mode="synthetic" getAccessToken={async () => 'synthetic-example-token'} /></StrictMode>);
} else {
  root.render(<StrictMode><Auth0Provider domain={domain!} clientId={clientId!}
    authorizationParams={{ redirect_uri: window.location.origin, audience, scope: 'openid profile email notes:read notes:write' }}
    cacheLocation="memory" useRefreshTokens
    onRedirectCallback={() => window.history.replaceState({}, document.title, window.location.pathname)}>
    <AuthenticatedApp baseUrl={baseUrl} audience={audience!} />
  </Auth0Provider></StrictMode>);
}
