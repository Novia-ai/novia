const dns = require('dns').promises;
const net = require('net');
const cheerio = require('cheerio');

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_TEXT_LENGTH = 8000;

class ImportError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.replace('::ffff:', ''));
    return false;
  }
  return true;
}

async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ImportError('URL invalide.', 400);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ImportError('Seuls les liens http:// et https:// sont acceptes.', 400);
  }

  let address;
  try {
    ({ address } = await dns.lookup(parsed.hostname));
  } catch {
    throw new ImportError('Impossible de resoudre ce nom de domaine.', 400);
  }
  if (isPrivateIp(address)) {
    throw new ImportError("Cette adresse n'est pas autorisee.", 400);
  }

  return parsed;
}

async function fetchPageText(rawUrl) {
  const url = await assertPublicUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'NovIA-Widget-Import/1.0' },
    });
  } catch {
    throw new ImportError('Impossible de recuperer cette page (delai depasse ou site inaccessible).', 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ImportError(`La page a renvoye une erreur (HTTP ${response.status}).`, 502);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new ImportError('Cette page ne semble pas etre une page HTML.', 400);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_BYTES) {
      throw new ImportError('Cette page est trop volumineuse.', 413);
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');

  const $ = cheerio.load(html);
  $('script, style, noscript, svg, nav, footer, iframe').remove();
  const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

  if (!text) {
    throw new ImportError("Aucun texte lisible n'a ete trouve sur cette page.", 400);
  }

  return text.slice(0, MAX_TEXT_LENGTH);
}

module.exports = { fetchPageText, ImportError };
