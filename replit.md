# Dragon Bot

بوت Discord لإدارة متجر الرومات في سيرفر Dragon — يدعم الشراء عبر ProBot، تذاكر الدعم، رصيد المنشنات، AutoMod، وحماية الرومات.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — تشغيل السيرفر + البوت (port 8080)
- `pnpm run typecheck` — فحص الأنواع
- `pnpm run build` — بناء المشروع
- `pnpm --filter @workspace/db run push` — تطبيق تغييرات الـ DB schema

## Required Secrets

- `DISCORD_TOKEN` — توكن البوت من Discord Developer Portal
- `OWNER_ID` — Discord User ID لصاحب السيرفر
- `GUILD_ID` — Discord Guild ID للسيرفر
- `DATABASE_URL` — يُوفَّر تلقائياً من Replit

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Discord: discord.js v14
- DB: PostgreSQL + Drizzle ORM
- Build: esbuild

## Where things live

- `artifacts/api-server/src/bot.ts` — الكود الرئيسي للبوت
- `artifacts/api-server/assets/` — الصور (dragon_banner.webp, dragon_text_banner.webp, dragon.webp)
- `lib/db/src/schema/index.ts` — DB schema: rooms, purchases, bot_users, warnings
- `artifacts/api-server/src/index.ts` — entry point يشغّل السيرفر + البوت

## Bot Features

- `/shop` — بانل المتجر مع أزرار الفئات
- `/myroom` — عرض رومات المستخدم
- `/transferroom` — تحويل ملكية روم
- `/addroom`, `/listrooms`, `/deleteroom` — إدارة الرومات (Admin فقط)
- `/synccategories`, `/setcategoryid` — ربط الرومات بالكاتيجوريهات
- `/givebalance` — إضافة رصيد منشنات (Admin فقط)
- AutoMod: حجب كلمات محظورة + حجب منشنات بدون رصيد
- حماية رومات العملاء: لينكات، تشفير، اسبام منشنات

## Assets

| الملف | الوصف |
|-------|--------|
| `dragon_banner.webp` | بانر كبير في /shop وبعد إنشاء الروم |
| `dragon_text_banner.webp` | بانر قائمة الفئات |
| `dragon.webp` | صورة thumbnail جنب تفاصيل الروم (لو موجودة) |

## Architecture decisions

- البوت يشتغل جنب Express server في نفس الـ process
- الـ DB schema مبني بـ Drizzle ORM مع Zod validation
- الصور بتتحمّل من `artifacts/api-server/assets/` بـ path مطلق
- لو صورة مش موجودة، البوت يشتغل بدونها عادي

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- لازم تشغّل `pnpm --filter @workspace/db run push` بعد أي تغيير في الـ schema
- الـ `dragon.webp` (thumbnail) مش موجودة — لو عايز تضيفها حطّها في `artifacts/api-server/assets/dragon.webp`
