# Security Policy

Please do not report vulnerabilities or exposed credentials in public issues. Use GitHub private vulnerability reporting (when enabled) or contact the repository maintainers privately. Never commit environment files, browser profiles, session files, access tokens or customer data.

## What this code protects against

- **Writes are off by default.** Every send, edit, delete, pin or forward needs `confirm: true`, the chat on the messenger's allowlist and `NABU_MESSAGING_ENABLE_SEND=1`. Account changes (creating, joining or leaving chats, members, admins) additionally need `NABU_WEB_ALLOW_ACCOUNT_CHANGES=1`.
- **No bulk operations.** One chat per call; at most 5 members added per call.
- **Local files** are read only from inside `NABU_MESSAGING_FILE_ROOT`; downloads are written only under its `downloads/` folder.
- **Tokens** are read from the environment and never returned in tool results or errors.
- **Sign-in codes and 2FA passwords** are never accepted by any tool; the user types them in the browser window.

## What it does not protect against

- Web mode runs the messenger with the user's own account. Anyone who can read the browser profile folder (`~/.nabuxai/iranian-messaging-profiles`) can use that account. Keep it on an encrypted disk and a single-user machine.
- `fileUrl` downloads any public https URL the agent gives it. Run the server where that is acceptable.
- Automating a personal account may break a messenger's terms of service and can get the account limited.
