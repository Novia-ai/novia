const dns = require('dns').promises;
const net = require('net');
const cheerio = require('cheerio');

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_TEXT_LENGTH = 8000;

class ImportError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
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
    throw new ImportError('invalid_url', 400);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ImportError('invalid_protocol', 400);
  }

  let address;
  try {
    ({ address } = await dns.lookup(parsed.hostname));
  } catch {
    throw new ImportError('dns_error', 400);
  }
  if (isPrivateIp(address)) {
    throw new ImportError('private_address', 400);
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
    throw new ImportError('fetch_failed', 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ImportError('bad_status', 502);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new ImportError('not_html', 400);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > MAX_BYTES) {
      throw new ImportError('too_large', 413);
    }
    chunks.push(value);
  }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  const $ = cheerio.load(html);

  const links = extractSameOriginLinks($, url);

  $('script, style, noscript, svg, nav, footer, iframe').remove();
  const bodyText = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

  if (!bodyText) {
    throw new ImportError('no_text', 400);
  }

  let result = '';
  if (links.length > 0) {
    const indexLines = links.map((l) => `- ${l.text} : ${l.url}`).join('\n');
    result += `Pages disponibles sur ce site (a utiliser pour recommander la bonne page a un visiteur) :\n${indexLines}\n\n`;
  }
  result += bodyText;

  return result.slice(0, MAX_TEXT_LENGTH);
}

function extractSameOriginLinks($, baseUrl) {
  const seen = new Set();
  const links = [];

  $('a[href]').each((i, el) => {
    if (links.length >= 40) return;

    const href = $(el).attr('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2 || text.length > 80) return;

    let absolute;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (absolute.hostname !== baseUrl.hostname) return;

    absolute.hash = '';
    const key = absolute.toString();
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ text, url: key });
  });

  return links;
}

module.exports = { fetchPageText, ImportError };
