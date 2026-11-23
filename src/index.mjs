// Soroush Plus MCP server: the official bot API and the user's own account through Soroush Plus Web.
import { createMessengerServer, runStdio } from '@nabuxai/iranian-messaging-core';
import { soroushplus as botAdapter } from './bot.mjs';
import { soroushplus as webDriver } from './web.mjs';

export { botAdapter, webDriver };
export const options = { id: 'soroushplus', label: 'Soroush Plus', botAdapter, webDriver };
export const createServer = (extra = {}) => createMessengerServer({ ...options, ...extra });
export const start = (extra = {}) => runStdio({ ...options, ...extra });
