#!/usr/bin/env node
// Local connection: Claude starts this file and talks to it over standard input and output.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {createServer} from './mcp.mjs';

// The collection lives in the plugin's own data folder, or in ~/.art-day for the desktop extension.
const dataDir = process.env.ART_DAY_DATA || process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.art-day');
const handle = createServer({dataDir});

for await (const line of createInterface({input: process.stdin})) {
  if (!line.trim()) continue;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Malformed JSON'}}) + '\n');
    continue;
  }
  const response = await handle(message);
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
}
