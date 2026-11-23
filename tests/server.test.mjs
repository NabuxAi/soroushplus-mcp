import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, botAdapter, webDriver } from '../src/index.mjs';

const VARS = ['NABU_MESSAGING_ENABLE_SEND', 'NABU_BROWSER_ENABLE', 'SOROUSHPLUS_BOT_TOKEN', 'SOROUSHPLUS_ALLOWED_CHAT_IDS', 'SOROUSHPLUS_WEB_ALLOWED_CHATS'];
const saved = Object.fromEntries(VARS.map(k => [k, process.env[k]]));
beforeEach(() => { for (const k of VARS) delete process.env[k]; });
afterEach(() => { for (const k of VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

async function connect(fetcher) {
  const server = createServer({ fetcher });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(a);
  return client;
}

test('tools are prefixed with soroushplus_ and include both modes', async () => {
  const client = await connect();
  const names = (await client.listTools()).tools.map(t => t.name);
  assert.ok(names.every(n => n.startsWith('soroushplus_')));
  assert.ok(names.includes('soroushplus_bot_preview_message'));
  assert.ok(names.includes('soroushplus_web_send_message'));
  assert.ok(names.includes('soroushplus_web_capabilities'));
  await client.close();
});

test('the web driver points at the official web app only', () => {
  assert.equal(webDriver.url, 'https://web.splus.ir/');
  assert.equal(new URL(webDriver.url).hostname, webDriver.host);
});

test('bot writes stay locked until confirmed, allowlisted and enabled', async () => {
  const client = await connect(async () => { throw new Error('no network in tests'); });
  const call = args => client.callTool({ name: 'soroushplus_bot_send_message', arguments: { chatId: '1', text: 'hi', ...args } });
  process.env.SOROUSHPLUS_BOT_TOKEN = 'test-token-0123456789';
  assert.match((await call({ confirm: false })).content[0].text, /EXPLICIT_CONFIRMATION_REQUIRED/);
  assert.match((await call({ confirm: true })).content[0].text, /RECIPIENT_NOT_ALLOWLISTED/);
  process.env.SOROUSHPLUS_ALLOWED_CHAT_IDS = '1';
  assert.match((await call({ confirm: true })).content[0].text, /SEND_DISABLED_BY_DEFAULT/);
  await client.close();
});

test('the bot sends to the official API host', async () => {
  const seen = [];
  const fetcher = async (url, init) => {
    seen.push(new URL(String(url)).hostname);
    return { ok: true, status: 200, json: async () => ({ ok: true, status: 'OK', id: 7, result: { message_id: 7 }, data: { message_id: '7' } }) };
  };
  const client = await connect(fetcher);
  process.env.SOROUSHPLUS_BOT_TOKEN = 'test-token-0123456789';
  process.env.SOROUSHPLUS_ALLOWED_CHAT_IDS = '1';
  process.env.NABU_MESSAGING_ENABLE_SEND = '1';
  const res = await client.callTool({ name: 'soroushplus_bot_send_message', arguments: { chatId: '1', text: 'hi', confirm: true } });
  assert.ok(!res.isError, res.content[0].text);
  assert.equal(seen.length, 1);
  assert.ok(!seen[0].includes('localhost'));
  await client.close();
});

test('web writes need the web allowlist and a signed-in window', async () => {
  const client = await connect();
  process.env.NABU_BROWSER_ENABLE = '1';
  process.env.NABU_MESSAGING_ENABLE_SEND = '1';
  const call = () => client.callTool({ name: 'soroushplus_web_send_message', arguments: { chatId: 'me', text: 'hi', confirm: true } });
  assert.match((await call()).content[0].text, /RECIPIENT_NOT_ALLOWLISTED_ADD_TO_SOROUSHPLUS_WEB_ALLOWED_CHATS/);
  process.env.SOROUSHPLUS_WEB_ALLOWED_CHATS = 'me';
  assert.match((await call()).content[0].text, /WEB_APP_NOT_OPEN_CALL_OPEN_FIRST/);
  await client.close();
});
