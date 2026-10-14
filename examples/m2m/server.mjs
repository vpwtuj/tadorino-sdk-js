import { createApp } from './app.js';
import { createTokenProvider } from './token-provider.js';

export function startLocalDemo() {
  const getAccessToken = createTokenProvider({ issuer: process.env.AUTH0_ISSUER, clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET, audience: process.env.AUTH0_AUDIENCE });
  const app = createApp({ baseUrl: process.env.TADORINO_BASE_URL, getAccessToken });
  return app.listen(5181, '127.0.0.1');
}
