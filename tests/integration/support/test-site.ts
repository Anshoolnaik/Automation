import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TestSite {
  origin: string;
  close(): Promise<void>;
}

const PAGES: Record<string, string> = {
  '/': `<!doctype html>
<html><head><title>Atlas Test Page</title></head>
<body>
  <h1>Atlas integration test</h1>
  <form action="/results" method="get">
    <input id="search" name="q" type="search" />
  </form>
  <div style="height: 4000px">tall content</div>
</body></html>`,
  '/results': `<!doctype html>
<html><head><title>Results</title><script>
  document.addEventListener('DOMContentLoaded', () => {
    const q = new URLSearchParams(location.search).get('q') ?? '';
    document.title = 'Results for ' + q;
    document.getElementById('query').textContent = q;
  });
</script></head>
<body><p>You searched for <span id="query"></span></p></body></html>`,
  '/remember': `<!doctype html>
<html><head><title>Remember</title></head><body><script>
  localStorage.setItem('atlas-persistence', 'still-here');
  document.title = 'Remembered';
</script></body></html>`,
  '/recall': `<!doctype html>
<html><head><title>Recall</title></head><body><script>
  document.title = 'Recall: ' + (localStorage.getItem('atlas-persistence') ?? 'nothing');
</script></body></html>`,
};

/** A tiny local website on 127.0.0.1 so browser tests never depend on the internet. */
export async function startTestSite(): Promise<TestSite> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const body = PAGES[pathname];
    if (body === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
