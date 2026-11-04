// Host-specific discovery documents; never include private operational URLs.
export function servePublicSearch(req, res, mode) {
  if (mode !== 'pos' || !['GET', 'HEAD'].includes(req.method)) return false;
  const host = String(req.headers.host || '').toLowerCase();
  const pos = /^(?:www\.)?bringness-pos\.de(?::443)?$/.test(host);
  const market = /^(?:www\.)?bringness\.de(?::443)?$/.test(host);
  if (!pos && !market) return false;
  const pathname = new URL(req.url, 'https://bringness.de').pathname;
  if (!['/robots.txt', '/sitemap.xml'].includes(pathname)) return false;
  const origin = pos ? 'https://bringness-pos.de' : 'https://bringness.de';
  const urls = pos ? ['/', '/vorfuehrung/', '/preise/', '/ueber-uns/', '/qr-bestellungen.html'] : ['/', '/shop/marketplace.html'];
  const sitemap = pathname === '/sitemap.xml';
  const body = sitemap
    ? '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map(p => '<url><loc>' + origin + p + '</loc></url>').join('') + '</urlset>\n'
    : 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /pos/\nDisallow: /service/\nDisallow: /admin/\nDisallow: /superadmin/\nDisallow: /tisch/\nDisallow: /display/\nSitemap: ' + origin + '/sitemap.xml\n';
  res.writeHead(200, {'content-type': sitemap ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff'});
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
