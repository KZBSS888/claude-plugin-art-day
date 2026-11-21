#!/usr/bin/env node
// Server connection: the same collection, reached by Claude as a remote connector.
// The address contains a long private key; put this behind HTTPS (a reverse proxy or a tunnel).
import {timingSafeEqual} from 'node:crypto';
import {createServer as createHttpServer} from 'node:http';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './mcp.mjs';

const MAX_BODY_BYTES = 256 * 1024;
const token = process.env.ART_DAY_TOKEN || '';
if (token.length < 32) {
  console.error('Set ART_DAY_TOKEN: a random string of at least 32 characters.');
  process.exit(1);
}
const host = process.env.ART_DAY_HOST || '127.0.0.1';
const port = Number(process.env.ART_DAY_PORT || 8787);
const handle = createServer({dataDir: process.env.ART_DAY_DATA || join(homedir(), '.art-day')});

function authorized(url) {
  const given = Buffer.from(url.pathname), expected = Buffer.from('/mcp/' + token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

createHttpServer(async (request, response) => {
  const send = (status, body) => {
    response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    response.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (!authorized(new URL(request.url, 'http://local'))) return send(404, {error: 'Not found'});
  if (request.method !== 'POST') return send(405, {error: 'POST only'});
  try {
    const body = await readJson(request);
    const responses = (await Promise.all([body].flat().map(handle))).filter(Boolean);
    if (!responses.length) return send(202);
    send(200, Array.isArray(body) ? responses : responses[0]);
  } catch {
    send(400, {jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Malformed request'}});
  }
}).listen(port, host, () => console.error(`Art Day is listening on http://${host}:${port}/mcp/<key>`));
