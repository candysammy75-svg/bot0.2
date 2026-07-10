---
name: Dragon Shop Bot notes
description: Conventions of the Discord shop bot (artifacts/api-server) — where logic lives, how ownership/admin checks work.
---

- All Discord.js bot logic lives in one large file, `artifacts/api-server/src/bot.ts` (~6900+ lines). Interaction handlers are a long chain of `if (interaction.isButton() && interaction.customId.startsWith(...))` blocks in a single `Events.InteractionCreate` listener, and message moderation/logic lives in one `Events.MessageCreate` listener. New features should follow this existing pattern rather than introducing a new router/module structure, to stay consistent.
- A "room channel" (`purchasesTable` row with `status: "completed"`, `discordRoomId`) represents a customer's purchased store/room. `discordUserId` on that row is the store owner; `partnerDiscordUserId` (nullable) is a co-owner with equal permissions.
- "Admin" throughout the bot means anyone with the Discord `Administrator` permission on the guild — there is no separate fixed admin role ID. Use `member.permissions.has(PermissionFlagsBits.Administrator)` (or fetch all guild members and filter) rather than checking a role ID.
- DB schema changes require `cd lib/db && pnpm run push` (drizzle-kit push) before restarting the `Dragon Bot` workflow, or the app will read/write against a stale schema.
- Required secrets to run at all: `DISCORD_TOKEN`, `OWNER_ID`, `GUILD_ID` (module-level `throw` in bot.ts if missing — the whole process crashes on boot without them, not just Discord features).
