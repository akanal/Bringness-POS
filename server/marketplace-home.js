// Serve the existing marketplace at the public domain root without duplicating it.
export function serveMarketplaceHome(req, res, mode, readHome) {
  if (mode !== 'pos' || !['GET', 'HEAD'].includes(req.method)) return false;
  if (!/^(?:www\.)?bringness\.de(?::443)?$/i.test(String(req.headers.host || ''))) return false;
  const pathname = new URL(req.url, 'https://bringness.de').pathname;
  if (pathname === '/pos-info.html') {
    req.url = '/index.html' + new URL(req.url, 'https://bringness.de').search;
    return false;
  }
  if (!['/', '/index.html'].includes(pathname)) return false;
  const html = readHome().replace('<head>', '<head><base href="/shop/">')
    .replaceAll('href="#', 'href="/#');
  res.writeHead(200, {'content-type':'text/html; charset=utf-8', 'cache-control':'no-store, max-age=0',
    'x-content-type-options':'nosniff', 'referrer-policy':'strict-origin-when-cross-origin', 'x-frame-options':'SAMEORIGIN'});
  res.end(req.method === 'HEAD' ? undefined : html);
  return true;
}
