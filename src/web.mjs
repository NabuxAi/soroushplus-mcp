// Soroush Plus Web is a fork of Telegram Web A. Its modules are reachable
// through the webpack chunk registry (window.webpackChunkSoroushPlus): the
// global-state module gives getGlobal() (chats, users, currentUserId) and the
// API connector gives callApi(name, ...args), which runs the same MTProto
// methods the UI uses in its worker. Module ids and export names change with
// every build, so both are found by what their code contains and does.
//
// Worker methods used (argument shapes read from the app's own call sites):
// fetchMessages, fetchMessage, sendMessage (text, replyInfo, attachment, poll,
// contact), editMessage, deleteMessages, forwardMessages, pinMessage,
// markMessageListRead, searchMessagesLocal/Global, fetchFullChat,
// fetchFullUser, fetchContactList, downloadMedia, createChannel,
// createGroupChat, updateChatTitle/About, importChatInvite, joinChannel,
// leaveChannel, deleteChatUser, addChatMembers, deleteChatMember,
// updateChatMemberBannedRights, updateChatAdmin. Most worker calls swallow
// server errors (the app shows them as a toast), so writes are checked by
// reading the result back where that is possible.
import { evaluate } from '@nabuxai/iranian-messaging-core';

// Installed in the page before each call; runs in the browser.
function installHelpers() {
  if (window.__nabuSplus?.version === 5) return;
  let require;
  window.webpackChunkSoroushPlus.push([[Symbol('nabu')], {}, r => { require = r; }]);
  const sources = Object.keys(require.m).map(id => [id, String(require.m[id])]);
  const find = (test, choose) => {
    for (const [id, src] of sources) {
      if (!test(src)) continue;
      const found = choose(require(id));
      if (found) return found;
    }
    return null;
  };
  const pick = (test, choose) => {
    const found = find(test, choose);
    if (!found) throw new Error('SOROUSHPLUS_WEB_CHANGED: internal module not found');
    return found;
  };
  const callApi = pick(src => src.includes('type:"callMethod"') && src.includes('initApi'), exports =>
    Object.values(exports).filter(f => typeof f === 'function' && String(f).includes('type:"callMethod"'))
      .sort((a, b) => String(b).length - String(a).length)[0]);
  const getGlobal = pick(src => src.includes('getGlobal') && src.includes('addActionHandler') && src.length < 600, exports =>
    Object.values(exports).find(f => {
      try { const g = typeof f === 'function' && f.length === 0 && f(); return Boolean(g && g.chats && g.users); } catch { return false; }
    }));
  // getMessageMediaHash(message, target): the "msg<chat>-<id>:<media>?..." key the media loader downloads by.
  const mediaHash = find(src => src.includes('staticMap:') && src.includes('case"download"'), exports =>
    Object.values(exports).find(f => typeof f === 'function' && String(f).includes('case"download"') && String(f).includes('webPage')));
  const me = () => getGlobal().currentUserId;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const MAIN_THREAD = -1;
  const isChannelLike = chat => chat.type === 'chatTypeChannel' || chat.type === 'chatTypeSuperGroup';
  const userName = user => [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null;
  // Contacts are often saved under (or with) their phone number; never pass a number on.
  const safeName = user => (userName(user) || '').replace(/\+?[\d۰-۹][\d۰-۹\s()-]{5,}[\d۰-۹]/g, '')
    .replace(/\s+/g, ' ').trim() || null;
  const usernameOf = peer => peer?.usernames?.find(u => u.isActive)?.username || peer?.usernames?.[0]?.username || null;

  const H = window.__nabuSplus = {
    version: 5, callApi, getGlobal, me, sleep, MAIN_THREAD, isChannelLike, userName, safeName, usernameOf,
    async guard(body) {
      try { return await body(); } catch (error) {
        throw new Error((error && (error.message || error.type)) || String(error));
      }
    },
    // "me"/"saved" = Saved Messages; a numeric id as is; anything else is a username.
    async resolve(input) {
      const raw = String(input).trim();
      const global = getGlobal();
      let id = /^(me|saved|self)$/i.test(raw) ? me() : /^-?\d+$/.test(raw) ? raw : null;
      if (!id) {
        const found = await callApi('getChatByUsername', raw.replace(/^@/, ''));
        id = found?.chat?.id;
        if (!id) throw new Error('CHAT_NOT_FOUND');
        return found.chat;
      }
      const chat = global.chats.byId[id];
      if (!chat) throw new Error('CHAT_NOT_LOADED_OPEN_IT_ONCE_IN_THE_APP');
      return chat;
    },
    // A user by numeric id (already known to the app) or @username.
    async user(input) {
      const raw = String(input).trim().replace(/^@/, '');
      if (/^\d+$/.test(raw)) {
        const known = getGlobal().users.byId[raw];
        if (!known) throw new Error('USER_NOT_LOADED_USE_THEIR_USERNAME');
        return known;
      }
      const found = await callApi('getChatByUsername', raw);
      if (!found?.user || found.chat?.type !== 'chatTypePrivate') throw new Error('USER_NOT_FOUND');
      return found.user;
    },
    chatType(chat) {
      if (chat.type === 'chatTypeChannel') return 'channel';
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') {
        return getGlobal().users.byId[chat.id]?.type === 'userTypeBot' ? 'bot' : 'user';
      }
      return 'group';
    },
    role(chat) {
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret' || chat.isNotJoined) return null;
      if (chat.isCreator) return 'creator';
      return chat.adminRights && Object.values(chat.adminRights).some(Boolean) ? 'admin' : 'member';
    },
    shape(m) {
      return {
        messageId: String(m.id),
        date: m.date ? new Date(m.date * 1000).toISOString() : null,
        fromId: m.senderId != null ? String(m.senderId) : null,
        outgoing: Boolean(m.isOutgoing) || String(m.senderId) === String(me()),
        text: m.content?.text?.text || null,
        media: Object.keys(m.content || {}).find(key => key !== 'text') || null,
        views: typeof m.viewsCount === 'number' ? m.viewsCount : null
      };
    },
    async fetch(chat, limit, offsetId) {
      const result = await callApi('fetchMessages', { chat, threadId: MAIN_THREAD, limit, offsetId: offsetId || 0, addOffset: 0 });
      if (!result) throw new Error('FETCH_FAILED');
      return result.messages || [];
    },
    // One message by id, or null when it does not exist (deleted).
    async message(chat, messageId) {
      const result = await callApi('fetchMessage', { chat, messageId: Number(messageId) });
      return result && result !== 'MESSAGE_DELETED' && result.message ? result.message : null;
    },
    async mustMessage(chat, messageId) {
      const found = await H.message(chat, messageId);
      if (!found) throw new Error('MESSAGE_NOT_FOUND: ' + messageId);
      return found;
    },
    async newestId(chat) {
      const messages = await H.fetch(chat, 5, 0);
      return Math.max(0, ...messages.map(m => Number(m.id)));
    },
    // Wait until the server has a message of ours newer than beforeId.
    async awaitSent(chat, beforeId, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const messages = await H.fetch(chat, 5, 0);
        const sent = messages.filter(m => String(m.senderId) === String(me()) && Number(m.id) > beforeId)
          .sort((a, b) => b.id - a.id)[0];
        if (sent) return { messageId: String(sent.id), pending: false };
        await sleep(1000);
      }
      return { messageId: null, pending: true };
    },
    failedIds(chat) {
      const byId = getGlobal().messages.byChatId[chat.id]?.byId || {};
      return Object.values(byId).filter(m => m.sendingState === 'messageSendingStateFailed').map(m => String(m.id));
    },
    // sendMessage without an upload: the server answers within seconds, and a
    // refusal shows up as a failed local copy, which is reported as an error.
    async sendAndConfirm(chat, params) {
      const beforeId = await H.newestId(chat);
      const failedBefore = new Set(H.failedIds(chat));
      await callApi('sendMessage', { chat, ...params }, () => {});
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const sent = await H.awaitSent(chat, beforeId, 1);
        if (!sent.pending) return { chatId: String(chat.id), ...sent };
        if (H.failedIds(chat).some(id => !failedBefore.has(id))) throw new Error('SEND_REFUSED_BY_SERVER');
        await sleep(1000);
      }
      return { chatId: String(chat.id), messageId: null, pending: true };
    },
    async fullChat(chat) {
      const full = await callApi('fetchFullChat', chat);
      if (!full?.fullInfo) throw new Error('CHAT_INFO_UNAVAILABLE');
      return full;
    },
    async blobToBase64(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    },
    mediaHash: mediaHash || null
  };
}

async function inApp(page, fn, arg) {
  const ready = await page.waitForFunction(() => Boolean(window.webpackChunkSoroushPlus) &&
    document.querySelector('#LeftColumn, .chat-list') !== null, null, { timeout: 20000 }).then(() => true, () => false);
  if (!ready) throw new Error('WEB_APP_NOT_READY_OR_NOT_SIGNED_IN');
  await evaluate(page, installHelpers);
  return evaluate(page, fn, arg);
}

async function dismissInstallPrompt(page) {
  const ok = page.getByRole('button', { name: 'متوجه شدم' });
  if (await ok.count()) await ok.first().click().catch(() => {});
}

export const soroushplus = {
  id: 'soroushplus',
  label: 'Soroush Plus Web',
  url: 'https://web.splus.ir/',
  host: 'web.splus.ir',
  chatIdHint: '"me" for Saved Messages, @username, or a numeric chatId from messaging_web_list_chats (channels and groups are negative)',
  notes: 'No location sending (the web app has no way to send one); polls only in groups and channels. New groups need at ' +
    'least one member (create a channel instead for an empty one); setAdmin works on channels and supergroups only; ' +
    'pins in one-to-one chats are one-sided; getMembers returns up to 200 recent ' +
    'members and needs admin rights in channels; getInviteLink only returns an existing link (never creates or revokes one).',

  async loginState(page) {
    await dismissInstallPrompt(page);
    if (await page.locator('#LeftColumn, .chat-list').count()) {
      try {
        return await inApp(page, () => {
          const global = window.__nabuSplus.getGlobal();
          const user = global.users.byId[global.currentUserId] || {};
          return { signedIn: Boolean(global.currentUserId), userId: String(global.currentUserId),
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null };
        });
      } catch { /* fall through to the login page checks */ }
    }
    const step = await page.evaluate(() => document.querySelector('#sign-in-phone-number') && !document.querySelector('#sign-in-code')
      ? 'waiting_for_phone'
      : document.querySelector('#sign-in-code') ? 'waiting_for_code'
        : document.querySelector('#sign-in-password') ? 'waiting_for_password' : 'loading');
    return { signedIn: false, step };
  },

  async loginStart(page, digits) {
    await dismissInstallPrompt(page);
    const field = page.locator('#sign-in-phone-number');
    await field.waitFor({ timeout: 20000 });
    await field.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('+98' + digits, { delay: 40 });
    await page.waitForTimeout(600);
    await page.locator('button[type=submit]').click();
  },

  listChats(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const global = H.getGlobal();
      const ids = [...(global.chats.listIds.active || [])];
      const chats = ids.map(id => global.chats.byId[id]).filter(Boolean)
        .sort((a, b) => (b.lastMessage?.date || 0) - (a.lastMessage?.date || 0))
        .slice(0, input.limit)
        .map(chat => {
          const user = global.users.byId[chat.id];
          const type = H.chatType(chat);
          return {
            chatId: String(chat.id),
            title: chat.title || H.userName(user),
            username: H.usernameOf(chat),
            type,
            unread: chat.unreadCount || 0,
            canPost: type !== 'channel' || Boolean(chat.isCreator || chat.adminRights?.postMessages)
          };
        });
      return { total: ids.length, chats };
    }), arg);
  },

  readChat(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const messages = (await H.fetch(chat, input.limit, input.before ? Number(input.before) : 0))
        .sort((a, b) => b.id - a.id).slice(0, input.limit);
      return {
        chatId: String(chat.id),
        messages: messages.map(H.shape),
        nextBeforeMessageId: messages.length === input.limit ? String(messages.at(-1).id) : null
      };
    }), arg);
  },

  sendText(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const beforeId = await H.newestId(chat);
      const replyInfo = input.replyToMessageId ? { type: 'message', replyToMsgId: Number(input.replyToMessageId) } : undefined;
      await H.callApi('sendMessage', { chat, text: input.text, ...(replyInfo ? { replyInfo } : {}) }, () => {});
      return { chatId: String(chat.id), ...(await H.awaitSent(chat, beforeId, 20000)) };
    }), arg);
  },

  sendFile(page, { chatId, file, caption }) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const beforeId = await H.newestId(chat);
      const bytes = Uint8Array.from(atob(input.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: input.mime });
      const attachment = { blob, blobUrl: URL.createObjectURL(blob), filename: input.name, mimeType: input.mime, size: blob.size };
      if (/^image\/(png|jpeg|gif|webp)$/.test(input.mime)) {
        const image = await createImageBitmap(blob);
        attachment.quick = { width: image.width, height: image.height };
      }
      // The upload only runs when a progress callback is passed.
      await H.callApi('sendMessage', { chat, text: input.caption || undefined, attachment }, () => {});
      return { chatId: String(chat.id), ...(await H.awaitSent(chat, beforeId, 120000)) };
    }), { chatId, base64: Buffer.from(file.bytes).toString('base64'), name: file.name, mime: file.mime, caption });
  },

  // ---- message operations ----

  editText(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const message = await H.mustMessage(chat, input.messageId);
      await H.callApi('editMessage', { chat, message, text: input.text });
      const after = await H.message(chat, input.messageId);
      if (after?.content?.text?.text !== input.text) throw new Error('EDIT_REFUSED_BY_SERVER');
      return { edited: true };
    }), arg);
  },

  deleteMessages(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const messageIds = input.messageIds.map(Number).filter(Number.isInteger);
      if (!messageIds.length) throw new Error('INVALID_MESSAGE_IDS');
      await H.callApi('deleteMessages', { chat, messageIds, shouldDeleteForAll: Boolean(input.forEveryone) });
      let deleted = 0;
      for (const id of messageIds) if (!(await H.message(chat, id))) deleted++;
      return { deleted };
    }), arg);
  },

  forwardMessages(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const fromChat = await H.resolve(input.fromChatId);
      const toChat = await H.resolve(input.toChatId);
      const messages = [];
      for (const id of input.messageIds) messages.push(await H.mustMessage(fromChat, id));
      messages.sort((a, b) => a.id - b.id);
      const beforeId = await H.newestId(toChat);
      await H.callApi('forwardMessages', { fromChat, toChat, toThreadId: H.MAIN_THREAD, messages, isCurrentUserPremium: false });
      const deadline = Date.now() + 20000;
      let found = [];
      while (Date.now() < deadline) {
        found = (await H.fetch(toChat, messages.length + 5, 0))
          .filter(m => Number(m.id) > beforeId && String(m.senderId) === String(H.me()));
        if (found.length >= messages.length) break;
        await H.sleep(1000);
      }
      return { messageIds: found.map(m => Number(m.id)).sort((a, b) => a - b).map(String) };
    }), arg);
  },

  pinMessage(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      await H.mustMessage(chat, input.messageId);
      const want = !input.unpin;
      const settled = async () => {
        for (let i = 0; i < 4; i++) {
          if (Boolean((await H.message(chat, input.messageId))?.isPinned) === want) return true;
          await H.sleep(700);
        }
        return false;
      };
      const params = { chat, messageId: Number(input.messageId), isUnpin: !want };
      await H.callApi('pinMessage', params);
      // The server ignores a two-sided pin in private chats (Saved Messages included); a one-sided one works.
      let done = await settled();
      if (!done && chat.type === 'chatTypePrivate') {
        await H.callApi('pinMessage', { ...params, isOneSide: true });
        done = await settled();
      }
      if (!done) throw new Error('PIN_REFUSED_BY_SERVER');
      return { pinned: want };
    }), arg);
  },

  markRead(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const maxId = await H.newestId(chat);
      await H.callApi('markMessageListRead', { chat, threadId: H.MAIN_THREAD, maxId });
      return { read: true };
    }), arg);
  },

  sendContact(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      return H.sendAndConfirm(chat, { contact: { phoneNumber: input.phone, firstName: input.firstName, lastName: input.lastName || '' } });
    }), arg);
  },

  sendPoll(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      // Like the app's own attach menu: no polls in one-to-one chats (the server
      // stores them as an empty, unsupported message there).
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') throw new Error('POLLS_ONLY_IN_GROUPS_AND_CHANNELS');
      const poll = { summary: {
        question: input.question,
        answers: input.options.map((text, i) => ({ text, option: String(i) })),
        ...(input.anonymous ? {} : { isPublic: true }),
        ...(input.multipleAnswers ? { multipleChoice: true } : {})
      } };
      const sent = await H.sendAndConfirm(chat, { poll });
      if (sent.messageId && !(await H.message(chat, sent.messageId))?.content?.poll) throw new Error('POLL_NOT_ACCEPTED_IN_THIS_CHAT');
      return sent;
    }), arg);
  },

  // ---- reading ----

  getChatInfo(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      const global = H.getGlobal();
      let description = null; let memberCount = null; let title = chat.title || null;
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') {
        const user = global.users.byId[chat.id];
        title = title || H.safeName(user);
        const full = await H.callApi('fetchFullUser', { id: chat.id, accessHash: user?.accessHash || chat.accessHash });
        description = full?.fullInfo?.bio || null;
      } else {
        const full = await H.fullChat(chat);
        description = full.fullInfo.about || null;
        memberCount = full.membersCount ?? full.fullInfo.members?.length ?? null;
      }
      return { chatId: String(chat.id), title, username: H.usernameOf(chat) || H.usernameOf(global.users.byId[chat.id]),
        type: H.chatType(chat), description, memberCount, role: H.role(chat) };
    }), arg);
  },

  getMembers(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') throw new Error('NOT_A_GROUP_OR_CHANNEL');
      const full = await H.fullChat(chat);
      const list = full.fullInfo.members;
      if (!list) throw new Error('MEMBER_LIST_NOT_VISIBLE_TO_THIS_ACCOUNT');
      const users = Object.fromEntries((full.users || []).map(u => [u.id, u]));
      const global = H.getGlobal();
      const q = input.query.trim().toLowerCase();
      const members = list.map(m => {
        const user = users[m.userId] || global.users.byId[m.userId];
        return { userId: String(m.userId), name: H.safeName(user), username: H.usernameOf(user),
          role: m.isOwner ? 'creator' : m.isAdmin ? 'admin' : 'member' };
      }).filter(m => !q || `${m.name || ''} ${m.username || ''}`.toLowerCase().includes(q));
      return { total: q ? members.length : (full.membersCount ?? list.length), members: members.slice(0, input.limit) };
    }), arg);
  },

  searchMessages(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      let result;
      let chatId = null;
      if (input.chatId) {
        const chat = await H.resolve(input.chatId);
        chatId = String(chat.id);
        result = await H.callApi('searchMessagesLocal',
          { chat, type: 'text', query: input.query, threadId: H.MAIN_THREAD, limit: input.limit, offsetId: 0 });
      } else {
        result = await H.callApi('searchMessagesGlobal', { query: input.query, type: 'text', limit: input.limit, offsetRate: 0, offsetId: 0 });
      }
      if (!result) throw new Error('SEARCH_FAILED');
      return { messages: (result.messages || []).slice(0, input.limit)
        .map(m => ({ chatId: chatId || String(m.chatId), ...H.shape(m) })) };
    }), arg);
  },

  downloadMedia(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      if (!H.mediaHash) throw new Error('SOROUSHPLUS_WEB_CHANGED: media module not found');
      const chat = await H.resolve(input.chatId);
      const message = await H.mustMessage(chat, input.messageId);
      const hash = H.mediaHash(message, 'download');
      if (!hash) throw new Error('MESSAGE_HAS_NO_DOWNLOADABLE_MEDIA');
      const result = await H.callApi('downloadMedia', { url: hash, mediaFormat: 0 }, () => {});
      const blob = result?.dataBlob;
      if (!(blob instanceof Blob)) throw new Error('DOWNLOAD_FAILED');
      if (blob.size > 50 * 1024 * 1024) throw new Error('FILE_TOO_LARGE_FOR_WEB_DOWNLOAD');
      const c = message.content || {};
      const doc = c.document || c.video || c.audio || c.voice || c.sticker;
      const mime = result.mimeType || blob.type || doc?.mimeType || null;
      const ext = (mime && mime.split('/')[1]?.split(';')[0]) || 'bin';
      const name = doc?.fileName || `${Object.keys(c).find(k => k !== 'text') || 'media'}-${message.id}.${ext === 'jpeg' ? 'jpg' : ext}`;
      return { name, mime, base64: await H.blobToBase64(blob) };
    }), arg);
  },

  // Reads only: fetchMessages is a plain history read and never marks anything read.
  getUnread(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const global = H.getGlobal();
      const ids = [...(global.chats.listIds.active || []), ...(global.chats.listIds.archived || [])];
      const unread = [...new Set(ids)].map(id => global.chats.byId[id])
        .filter(chat => chat && chat.unreadCount > 0)
        .sort((a, b) => (b.lastMessage?.date || 0) - (a.lastMessage?.date || 0))
        .slice(0, input.limit);
      const chats = [];
      for (const chat of unread) {
        const lastRead = Number(chat.lastReadInboxMessageId || 0);
        let messages = [];
        try {
          messages = (await H.fetch(chat, Math.min(chat.unreadCount, 10), 0))
            .filter(m => Number(m.id) > lastRead && !m.isOutgoing)
            .sort((a, b) => b.id - a.id).map(H.shape);
        } catch { /* keep the count even when the history cannot be read */ }
        chats.push({ chatId: String(chat.id), title: chat.title || H.safeName(global.users.byId[chat.id]),
          unread: chat.unreadCount, messages });
      }
      return { chats };
    }), arg);
  },

  // Names and usernames only; phone numbers are never returned.
  getContacts(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const result = await H.callApi('fetchContactList');
      if (!result) throw new Error('CONTACTS_UNAVAILABLE');
      const q = input.query.trim().toLowerCase();
      const contacts = (result.users || []).filter(u => !u.isSelf)
        .map(u => ({ userId: String(u.id), name: H.safeName(u), username: H.usernameOf(u) }))
        .filter(c => !q || `${c.name || ''} ${c.username || ''}`.toLowerCase().includes(q));
      return { total: contacts.length, contacts: contacts.slice(0, input.limit) };
    }), arg);
  },

  // ---- chat management ----

  createChat(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      let chat;
      if (input.type === 'channel') {
        chat = (await H.callApi('createChannel', { title: input.title, about: input.about || '', users: [] }))?.channel;
      } else {
        try {
          chat = (await H.callApi('createGroupChat', { title: input.title, users: [] }))?.chat;
        } catch (error) {
          if (/USERS_TOO_FEW/.test(error?.message)) throw new Error('GROUP_NEEDS_AT_LEAST_ONE_MEMBER_CREATE_A_CHANNEL_OR_ADD_MEMBERS_IN_APP');
          throw error;
        }
        if (chat && input.about) await H.callApi('updateChatAbout', chat, input.about);
      }
      if (!chat) throw new Error('CREATE_FAILED');
      return { chatId: String(chat.id), title: chat.title, type: input.type };
    }), arg);
  },

  updateChat(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') throw new Error('NOT_A_GROUP_OR_CHANNEL');
      if (input.title !== undefined && input.title !== chat.title) await H.callApi('updateChatTitle', chat, input.title);
      if (input.about !== undefined) await H.callApi('updateChatAbout', chat, input.about);
      const full = await H.fullChat(chat);
      const fresh = (full.chats || []).find(c => String(c.id) === String(chat.id));
      if (input.title !== undefined && fresh && fresh.title !== input.title) throw new Error('TITLE_CHANGE_REFUSED_BY_SERVER');
      if (input.about !== undefined && (full.fullInfo.about || '') !== input.about) throw new Error('ABOUT_CHANGE_REFUSED_BY_SERVER');
      return { updated: true };
    }), arg);
  },

  // Returns the chat's existing link; never creates or revokes one.
  getInviteLink(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') throw new Error('NOT_A_GROUP_OR_CHANNEL');
      const full = await H.fullChat(chat);
      const username = H.usernameOf(chat);
      const link = full.fullInfo.inviteLink || (username ? `https://splus.ir/${username}` : null);
      if (!link) throw new Error('NO_INVITE_LINK_VISIBLE_ONLY_ADMINS_CAN_SEE_OR_CREATE_ONE');
      return { link };
    }), arg);
  },

  // Invite links (splus.ir/joingroup/<hash>, splus.ir/+<hash>) or a public @username.
  joinChat(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const raw = input.link.trim();
      let hash = null; let username = null;
      if (/^@?[A-Za-z][\w]{3,}$/.test(raw)) username = raw.replace(/^@/, '');
      else {
        const url = new URL(/^https?:/i.test(raw) ? raw : `https://${raw}`);
        if (!/(^|\.)splus\.ir$/i.test(url.hostname)) throw new Error('NOT_A_SOROUSHPLUS_LINK');
        const [first, second] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        if (!first) throw new Error('INVALID_LINK');
        if (/^(joingroup|joinchat)$/i.test(first) && second) hash = second;
        else if (/^\+/.test(first) && !/^\+\d+$/.test(first)) hash = first.slice(1);
        else username = first;
      }
      if (hash) {
        const chat = await H.callApi('importChatInvite', { hash });
        if (!chat) throw new Error('JOIN_FAILED_INVALID_LINK_OR_ALREADY_A_MEMBER');
        return { chatId: String(chat.id), title: chat.title || null };
      }
      const found = await H.callApi('getChatByUsername', username);
      const chat = found?.chat;
      if (!chat) throw new Error('CHAT_NOT_FOUND');
      if (!H.isChannelLike(chat)) throw new Error('NOT_A_PUBLIC_GROUP_OR_CHANNEL');
      await H.callApi('joinChannel', { channelId: chat.id, accessHash: chat.accessHash });
      return { chatId: String(chat.id), title: chat.title || null };
    }), arg);
  },

  leaveChat(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      let ok;
      if (H.isChannelLike(chat)) ok = await H.callApi('leaveChannel', { channelId: chat.id, accessHash: chat.accessHash });
      else if (chat.type === 'chatTypeBasicGroup') {
        const self = H.getGlobal().users.byId[H.me()];
        ok = await H.callApi('deleteChatUser', { chat, user: self });
      } else throw new Error('NOT_A_GROUP_OR_CHANNEL');
      if (!ok) throw new Error('LEAVE_REFUSED_BY_SERVER');
      return { left: true };
    }), arg);
  },

  addMembers(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') throw new Error('NOT_A_GROUP_OR_CHANNEL');
      const users = [];
      for (const id of input.userIds) users.push(await H.user(id));
      const restricted = await H.callApi('addChatMembers', chat, users);
      return { added: users.length - (Array.isArray(restricted) ? restricted.length : 0) };
    }), arg);
  },

  // In channels and supergroups removing is a ban; without ban the user is unbanned right after, so they may rejoin.
  removeMember(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      if (chat.type === 'chatTypePrivate' || chat.type === 'chatTypeSecret') throw new Error('NOT_A_GROUP_OR_CHANNEL');
      const user = await H.user(input.userId);
      const ok = await H.callApi('deleteChatMember', chat, user);
      if (!ok) throw new Error('REMOVE_REFUSED_BY_SERVER');
      if (H.isChannelLike(chat) && !input.ban) {
        await H.callApi('updateChatMemberBannedRights', { chat, user, bannedRights: {} });
      }
      return { removed: true };
    }), arg);
  },

  setAdmin(page, arg) {
    return inApp(page, input => window.__nabuSplus.guard(async () => {
      const H = window.__nabuSplus;
      const chat = await H.resolve(input.chatId);
      if (!H.isChannelLike(chat)) throw new Error('ADMINS_ONLY_IN_CHANNELS_AND_SUPERGROUPS_ON_SOROUSHPLUS_WEB');
      const user = await H.user(input.userId);
      const adminRights = !input.isAdmin ? {} : chat.type === 'chatTypeChannel'
        ? { changeInfo: true, postMessages: true, editMessages: true, deleteMessages: true, inviteUsers: true }
        : { changeInfo: true, deleteMessages: true, banUsers: true, inviteUsers: true, pinMessages: true, manageCall: true };
      const ok = await H.callApi('updateChatAdmin', { chat, user, adminRights, customTitle: '' });
      if (!ok) throw new Error('ADMIN_CHANGE_REFUSED_BY_SERVER');
      return { updated: true };
    }), arg);
  }
};
