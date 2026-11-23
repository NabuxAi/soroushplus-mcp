# Soroush Plus MCP (سروش پلاس)

[![npm](https://img.shields.io/npm/v/@nabuxai/soroushplus-mcp)](https://www.npmjs.com/package/@nabuxai/soroushplus-mcp) [![CI](https://github.com/NabuxAi/soroushplus-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/NabuxAi/soroushplus-mcp/actions/workflows/ci.yml) ![license](https://img.shields.io/badge/license-MIT-blue)

یک سرور MCP برای پیام‌رسان سروش پلاس، تا دستیار هوش مصنوعی (Claude، Cursor، ChatGPT و …) بتواند پیام بخواند و بفرستد. دو حالت دارد:

- **حالت بات** — Bot API سروش پلاس (شبیه تلگرام، api.splus.ir): متن، عکس، دریافت پیام‌ها و getChat تأیید شده‌اند؛ بقیه امتحان می‌شوند.
- **حالت وب (اکانت خودتان)** — Soroush Plus Web در یک پنجره‌ی Chrome محلی با پروفایل جدا باز می‌شود و با اکانت خودتان کار می‌کند. یک بار خودتان وارد می‌شوید (کد ورود و رمز دومرحله‌ای را **فقط خودتان در همان پنجره** می‌زنید) و ورود ذخیره می‌ماند. 25 قابلیت از 26.

> English summary below.

## نصب در Claude Code / Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "soroushplus": {
      "command": "npx",
      "args": ["-y", "@nabuxai/soroushplus-mcp"],
      "env": {
        "NABU_MESSAGING_ENABLE_SEND": "1",
        "SOROUSHPLUS_BOT_TOKEN": "…",
        "SOROUSHPLUS_ALLOWED_CHAT_IDS": "…",
        "NABU_BROWSER_ENABLE": "1",
        "SOROUSHPLUS_WEB_ALLOWED_CHATS": "me"
      }
    }
  }
}
```

یا در Claude Code:

```bash
claude mcp add soroushplus -e NABU_BROWSER_ENABLE=1 -e SOROUSHPLUS_WEB_ALLOWED_CHATS=me -- npx -y @nabuxai/soroushplus-mcp
```

همه‌ی متغیرها در [`.env.example`](.env.example) توضیح داده شده‌اند. توکن بات: splus.ir/botfather. حالت وب به Chrome نصب‌شده نیاز دارد (یا `CHROME_EXECUTABLE_PATH`).

**IP ایران:** وب‌اپ و API بیشتر پیام‌رسان‌های ایرانی فقط از IP ایران جواب می‌دهند. اگر سیستم شما IP خارج دارد، از یک سرور داخل ایران تونل بزنید و `NABU_BROWSER_PROXY=socks5://127.0.0.1:1088` بدهید:

```bash
ssh -N -D 127.0.0.1:1088 <server-in-iran>
```

## شروع حالت وب

1. `soroushplus_web_open` — پنجره باز می‌شود.
2. اگر وارد نیستید: `soroushplus_web_login_start` با شماره موبایل؛ بعد کد را خودتان در پنجره بزنید.
3. `soroushplus_web_list_chats`، `soroushplus_web_read_chat`، `soroushplus_web_send_message` و …

## قابلیت‌های حالت وب

| قابلیت | ابزار | |
|---|---|---|
| فهرست گفتگوها | `soroushplus_web_list_chats` | ✅ |
| خواندن پیام‌ها | `soroushplus_web_read_chat` | ✅ |
| ارسال متن (و پاسخ) | `soroushplus_web_send_message` | ✅ |
| ارسال عکس و فایل | `soroushplus_web_send_file` | ✅ |
| ویرایش پیام | `soroushplus_web_editText` | ✅ |
| حذف پیام | `soroushplus_web_deleteMessages` | ✅ |
| هدایت (فوروارد) | `soroushplus_web_forwardMessages` | ✅ |
| سنجاق کردن | `soroushplus_web_pinMessage` | ✅ |
| خوانده‌شده کردن | `soroushplus_web_markRead` | ✅ |
| ارسال موقعیت | `soroushplus_web_sendLocation` | — |
| ارسال مخاطب | `soroushplus_web_sendContact` | ✅ |
| ارسال نظرسنجی | `soroushplus_web_sendPoll` | ✅ |
| اطلاعات گفتگو | `soroushplus_web_getChatInfo` | ✅ |
| اعضا | `soroushplus_web_getMembers` | ✅ |
| جستجوی پیام | `soroushplus_web_searchMessages` | ✅ |
| دانلود رسانه | `soroushplus_web_downloadMedia` | ✅ |
| پیام‌های نخوانده | `soroushplus_web_getUnread` | ✅ |
| مخاطبان | `soroushplus_web_getContacts` | ✅ |
| ساخت گروه/کانال | `soroushplus_web_createChat` | ✅ |
| تغییر نام/توضیح | `soroushplus_web_updateChat` | ✅ |
| لینک دعوت | `soroushplus_web_getInviteLink` | ✅ |
| عضویت | `soroushplus_web_joinChat` | ✅ |
| ترک گفتگو | `soroushplus_web_leaveChat` | ✅ |
| افزودن عضو | `soroushplus_web_addMembers` | ✅ |
| حذف عضو | `soroushplus_web_removeMember` | ✅ |
| ادمین کردن | `soroushplus_web_setAdmin` | ✅ |

**محدودیت‌ها:** No location sending (the web app has no way to send one); polls only in groups and channels. New groups need at least one member (create a channel instead for an empty one); setAdmin works on channels and supergroups only; pins in one-to-one chats are one-sided; getMembers returns up to 200 recent members and needs admin rights in channels; getInviteLink only returns an existing link (never creates or revokes one).

## قفل‌های امنیتی

| کار | چه لازم دارد |
|---|---|
| خواندن | توکن بات، یا پنجره‌ی واردشده و `NABU_BROWSER_ENABLE=1` |
| نوشتن در گفتگو (ارسال، ویرایش، حذف، سنجاق، فوروارد…) | `confirm: true`، گفتگو در `SOROUSHPLUS_ALLOWED_CHAT_IDS` (بات) یا `SOROUSHPLUS_WEB_ALLOWED_CHATS` (وب)، و `NABU_MESSAGING_ENABLE_SEND=1` |
| تغییر اکانت (ساخت/عضویت/ترک گفتگو، اعضا، ادمین) | همه‌ی موارد بالا و `NABU_WEB_ALLOW_ACCOUNT_CHANGES=1` |

ارسال انبوه وجود ندارد: هر بار یک گفتگو، و حداکثر ۵ عضو در هر بار افزودن.

**هشدار:** حالت وب اکانت شخصی شما را خودکار می‌کند و ممکن است خلاف قوانین سروش پلاس باشد؛ استفاده‌ی نادرست می‌تواند به محدود شدن اکانت برسد. هر کس به پوشه‌ی پروفایل مرورگر (`~/.nabuxai/iranian-messaging-profiles/soroushplus`) دسترسی داشته باشد به اکانت شما دسترسی دارد. جزئیات در [SECURITY.md](SECURITY.md).

---

## English

An MCP server for Soroush Plus. **Bot mode** — Soroush Plus's Telegram-style Bot API (api.splus.ir): text, photo, updates and getChat are confirmed; other calls are attempted. **Web mode** drives Soroush Plus Web in a local Chrome window with your own signed-in account (you type the sign-in code yourself in that window; the session is kept in a local profile). 25 of 26 web operations are available here; call `soroushplus_web_capabilities` for the live list.

Install: `npx -y @nabuxai/soroushplus-mcp` (see the JSON config above; every variable is documented in `.env.example`). Writes need `confirm: true`, an allowlisted chat and `NABU_MESSAGING_ENABLE_SEND=1`; account changes also need `NABU_WEB_ALLOW_ACCOUNT_CHANGES=1`. There is no bulk sending. Most Iranian messenger hosts only answer Iranian IPs; use `NABU_BROWSER_PROXY` with a SOCKS tunnel if needed.

Built on [`@nabuxai/iranian-messaging-core`](https://github.com/NabuxAi/iranian-messaging-core). Sister servers: [eitaa-mcp](https://github.com/NabuxAi/eitaa-mcp), [rubika-mcp](https://github.com/NabuxAi/rubika-mcp), [bale-mcp](https://github.com/NabuxAi/bale-mcp), [soroushplus-mcp](https://github.com/NabuxAi/soroushplus-mcp), [gap-mcp](https://github.com/NabuxAi/gap-mcp).

MIT © NabuxAI. Community project; not affiliated with or endorsed by Soroush Plus.
