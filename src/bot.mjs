// Soroush Plus bot platform: Telegram-style methods at api.splus.ir.
// getMe, getUpdates, sendMessage, sendPhoto and getChat are confirmed from a
// working integration; edit, delete and other file kinds are tried the
// Telegram way and the API's own error is passed back if it refuses.
import { telegramLike } from '@nabuxai/iranian-messaging-core';

export const soroushplus = telegramLike({
  id: 'soroushplus',
  label: 'Soroush Plus (سروش پلاس)',
  apiBase: process.env.SOROUSHPLUS_API_BASE || 'https://api.splus.ir',
  tokenEnv: 'SOROUSHPLUS_BOT_TOKEN',
  docs: 'https://soroushplus.com/p/documents/bot-platform'
});
