/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║                         Dragon Shop Bot                             ║
 * ║                                                                      ║
 * ║  بوت متجر الرومات — Discord.js v14                                   ║
 * ║                                                                      ║
 * ║  المميزات:                                                            ║
 * ║  • بانل متجر كامل بفئات (المتاجر / الطلبيات / المزاد / الرتب / الإضافات) ║
 * ║  • نظام تذاكر شراء تلقائي مع تحقق ProBot                            ║
 * ║  • نظام رصيد منشنات (@everyone / @here / @offers)                   ║
 * ║  • AutoMod: حجب الكلام الممنوع + التحكم في المنشنات                 ║
 * ║  • نظام تحذيرات وحظر تلقائي (3 تحذيرات = حظر 4 أيام)               ║
 * ║  • أسعار إضافات (21 إضافة) مخزنة في DB وقابلة للتعديل              ║
 * ║  • تحويل ملكية الرومات مع رسوم 50%                                  ║
 * ║                                                                      ║
 * ║  Dev By: mostafa9321 & ahmed_.p                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  Events,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  AutoModerationActionType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
  type Message,
  type Interaction,
  type Guild,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import {
  db,
  roomsTable,
  purchasesTable,
  botUsersTable,
  warningsTable,
  addonPricesTable,
  auctionSchedulesTable,
} from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { logger } from "./lib/logger";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ══════════════════════════════════════════════════════════════════════════════
//  ENV — متغيرات البيئة
//  NOTE: كل المتغيرات دي لازم تكون موجودة في Replit Secrets.
//        لو أي واحد منهم مش موجود، البوت مش هيشتغل صح.
// ══════════════════════════════════════════════════════════════════════════════
const TOKEN    = process.env.DISCORD_TOKEN ?? "";
const OWNER_ID = process.env.OWNER_ID ?? "";
const GUILD_ID = process.env.GUILD_ID ?? "";

// تحقق من وجود المتغيرات المطلوبة قبل تشغيل البوت
if (!TOKEN)    throw new Error("DISCORD_TOKEN is required but not set");
if (!OWNER_ID) throw new Error("OWNER_ID is required but not set");
if (!GUILD_ID) throw new Error("GUILD_ID is required but not set");

// ══════════════════════════════════════════════════════════════════════════════
//  ProBot — إعدادات التحويل
//  NOTE: PROBOT_USER_ID ده الـ ID الرسمي لبوت ProBot.
//        البوت بيرفض أي رسالة من بوت تاني حتى لو جاي من نفس الشانل،
//        ده بيمنع أي حد يعمل spoofing على رسائل الدفع.
// ══════════════════════════════════════════════════════════════════════════════
const PROBOT_USER_ID = "282859044593598464";

/** نسبة عمولة ProBot (5%) — بتتخصم من المبلغ عند التحويل */
const PROBOT_FEE = 0.05;

/**
 * يحسب المبلغ الكلي اللي المشتري يحوله عشان الأونر يستلم `netPrice` صافي.
 * المعادلة: gross = ceil(net / (1 - fee))
 * مثال: سعر صافي 1000 → المشتري يحول 1053
 */
function calcTransferAmount(netPrice: number): number {
  return Math.ceil(netPrice / (1 - PROBOT_FEE));
}

// ══════════════════════════════════════════════════════════════════════════════
//  AutoMod — الكلمات المحظورة
//  NOTE: القائمة دي بتتبعت لـ Discord AutoMod عند بدء تشغيل البوت.
//        أي تعديل هنا هياخد أفكت بعد restart البوت.
//        Discord بيبلوك الرسالة تلقائياً قبل ما تظهر لأي حد.
// ══════════════════════════════════════════════════════════════════════════════
const BANNED_WORDS = [
  // عربي
  "سب", "شتيمة", "عنصري", "كس", "زب", "طيز", "منيك", "عرص",
  // إنجليزي
  "fuck", "shit", "bitch", "nigger", "faggot", "asshole",
];

/**
 * ID رول "mention-bypass" اللي البوت بيعمله تلقائياً.
 * الناس اللي عندهم رصيد منشنات > 0 بياخدوا الرول ده
 * وبالتالي بيعدوا على قاعدة AutoMod اللي بتبلوك @everyone و @here.
 * NOTE: بيتحط بعد ما AutoMod يتعمل في ClientReady.
 */
// NOTE: رول mention-bypass اتشال — المنشنات بتتفلتر يدوياً في الرومات

// ══════════════════════════════════════════════════════════════════════════════
//  الإضافات — Addons
// ══════════════════════════════════════════════════════════════════════════════

/**
 * إيموجي Peepo_Helicopter المتحرك — بيظهر على كل زرار إضافة.
 * NOTE: لو الإيموجي اتحذف من السيرفر، الأزرار هتظهر بدون إيموجي بس مش هتتعطل.
 *       عشان تغير الإيموجي: غير الـ id والـ name بس، animated ابقى حطها true لو animated.
 */
const PEEPO_EMOJI = {
  id:       "1524223468197908651",
  name:     "DVN_Money",
  animated: true,
};

/**
 * قائمة الـ 21 إضافة — كل إضافة ليها:
 *   key:   مفتاح فريد بالإنجليزية (بيتخزن في DB وبيستخدم في customId للأزرار)
 *   label: النص العربي اللي بيظهر على الزرار
 *
 * ⚠️ RTL RENDERING NOTE — مهم جداً:
 *   Discord بيعرض الأزرار من اليمين لليسار (RTL) على كتير من الكليانتات.
 *   يعني: أول عنصر في الكود (index 0) يظهر على **يمين** الصف،
 *           وآخر عنصر (index 4 مثلاً) يظهر على **يسار** الصف.
 *
 *   عشان كده الترتيب في الكود معكوس تماماً عن الترتيب اللي عايزه على الشاشة:
 *   لو عايز الشاشة تبان هكذا:  [A] [B] [C] [D] [E]
 *   الكود لازم يكون بالترتيب:  [E] [D] [C] [B] [A]
 *
 *   الترتيب الحالي:
 *   Row 1 (شاشة): إزالة شريك | شريك | إضافة شريك | منشن شوب | منشن هير
 *   Row 2 (شاشة): تغيير مالك | تغيير نوع | تغيير إيموجي | تفعيل | تغيير اسم
 *   Row 3 (شاشة): منشن هير مزاد | منشن إيفري مزاد | منشن طلبات | منشن هير طلبات | منشن إيفري طلبات
 *   Row 4 (شاشة): منشن مزاد | تلقائي للخطوط | النشر التلقائي | المتجر | منشن إيفري
 *   Row 5 (شاشة): إزالة التحذير من المتجر
 *
 *   لو احتجت تغير الترتيب: عكس الأزرار اللي في نفس الصف.
 *   كل 5 عناصر = صف واحد (ActionRow).
 */
const ADDONS = [
  // ── Row 1 ─────────────────────────────────────────────────────────────────
  // شاشة: [إزالة شريك] [شريك] [إضافة شريك] [منشن شوب] [منشن هير]
  { key: "mention_here",              label: "سعر منشن هير" },            // يظهر يمين الصف
  { key: "mention_shop",              label: "سعر منشن شوب" },
  { key: "add_partner",               label: "سعر إضافة شريك" },
  { key: "partner",                   label: "سعر شريك" },
  { key: "remove_partner",            label: "سعر إزالة شريك" },          // يظهر يسار الصف
  // ── Row 2 ─────────────────────────────────────────────────────────────────
  // شاشة: [تغيير مالك] [تغيير نوع] [تغيير إيموجي] [تفعيل] [تغيير اسم]
  { key: "change_store_name",         label: "سعر تغيير اسم المتجر" },    // يمين
  { key: "activate_store",            label: "سعر تفعيل المتجر" },
  { key: "change_store_emoji",        label: "سعر تغيير إيموجي المتجر" },
  { key: "change_store_type",         label: "سعر تغيير نوع المتجر" },
  { key: "change_store_owner",        label: "سعر تغيير مالك المتجر" },   // يسار
  // ── Row 3 ─────────────────────────────────────────────────────────────────
  // شاشة: [منشن هير مزاد] [منشن إيفري مزاد] [منشن طلبات] [منشن هير طلبات] [منشن إيفري طلبات]
  { key: "mention_everyone_requests", label: "سعر منشن إيفري طلبات" },    // يمين
  { key: "mention_here_requests",     label: "سعر منشن هير طلبات" },
  { key: "mention_requests",          label: "سعر منشن طلبات" },
  { key: "mention_everyone_auction",  label: "سعر منشن إيفري مزاد" },
  { key: "mention_here_auction",      label: "سعر منشن هير مزاد" },       // يسار
  // ── Row 4 ─────────────────────────────────────────────────────────────────
  // شاشة: [منشن مزاد] [تلقائي للخطوط] [النشر التلقائي] [المتجر] [منشن إيفري]
  { key: "mention_everyone",          label: "سعر منشن إيفري" },          // يمين
  { key: "store",                     label: "سعر المتجر" },
  { key: "auto_publish",              label: "سعر النشر التلقائي" },
  { key: "auto_lines",                label: "سعر تلقائي للخطوط" },
  { key: "mention_auction",           label: "سعر منشن مزاد" },           // يسار
  // ── Row 5 ─────────────────────────────────────────────────────────────────
  // صف وحيد (زرار واحد)
  { key: "remove_store_warning",      label: "سعر إزالة التحذير من المتجر" },
] as const;

/** نوع TypeScript المشتق تلقائياً من مفاتيح الإضافات — بيستخدم في /setaddonprice */
type AddonKey = (typeof ADDONS)[number]["key"];

// ══════════════════════════════════════════════════════════════════════════════
//  Discord Client
//  NOTE: الـ intents دي الصلاحيات اللي البوت محتاجها من Discord.
//        لو حذفت intent هيبطل جزء من الوظايف:
//        - GuildMembers: محتاجة عشان تعمل fetch للمعضاء وتديهم الرولات
//        - GuildModeration: محتاجة لـ AutoMod
//        - MessageContent: محتاجة عشان تقرأ محتوى الرسائل (Privileged Intent)
// ══════════════════════════════════════════════════════════════════════════════
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // Privileged — لازم تفعّله في Developer Portal
    GatewayIntentBits.GuildMembers,     // Privileged — لازم تفعّله في Developer Portal
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message], // عشان يشتغل مع DMs
});

client.on("error", (err) => {
  logger.error({ err }, "Discord client error");
});

// ══════════════════════════════════════════════════════════════════════════════
//  DB Helpers — دوال قاعدة البيانات
// ══════════════════════════════════════════════════════════════════════════════

/**
 * بيجيب اليوزر من DB أو بيعمله create لو مش موجود.
 * NOTE: بيتنادى في أي عملية تحتاج اليوزر عشان نضمن وجوده في DB.
 */
async function getOrCreateUser(discordUserId: string, discordUsername: string) {
  const [existing] = await db
    .select()
    .from(botUsersTable)
    .where(eq(botUsersTable.discordUserId, discordUserId));
  if (existing) return existing;
  const [created] = await db
    .insert(botUsersTable)
    .values({ discordUserId, discordUsername })
    .returning();
  return created;
}

/**
 * بيتحقق لو اليوزر محظور.
 * NOTE: لو الحظر المؤقت خلص بيرفعه تلقائياً من DB.
 *       الحظر الدائم (bannedUntil = null & isBanned = true) يبقى ساري للأبد.
 */
async function isUserBanned(discordUserId: string): Promise<boolean> {
  const [user] = await db
    .select()
    .from(botUsersTable)
    .where(eq(botUsersTable.discordUserId, discordUserId));
  if (!user || !user.isBanned) return false;
  // حظر مؤقت — لو انتهى وقته ارفعه تلقائياً
  if (user.bannedUntil && new Date() > user.bannedUntil) {
    await db
      .update(botUsersTable)
      .set({ isBanned: false, bannedUntil: null })
      .where(eq(botUsersTable.discordUserId, discordUserId));
    return false;
  }
  return true;
}

/**
 * بيضيف تحذير لليوزر ويتحقق من العدد.
 * عند وصول 3 تحذيرات: يحظره 4 أيام تلقائياً.
 *
 * NOTE: التحذيرات بتتراكم — مش بتتمسح لو الحظر انتهى.
 *       لو عايز تمسح تحذيرات يوزر لازم تعمل DELETE يدوي من warnings table.
 *
 * @returns عدد التحذيرات الحالي وهل اتحظر ولا لأ
 */
async function addWarning(
  discordUserId: string,
  discordUsername: string,
  reason: string,
  messageContent?: string
): Promise<{ warningCount: number; banned: boolean }> {
  await getOrCreateUser(discordUserId, discordUsername);
  await db.insert(warningsTable).values({
    discordUserId,
    discordUsername,
    reason,
    messageContent,
  });

  const allWarnings = await db
    .select()
    .from(warningsTable)
    .where(eq(warningsTable.discordUserId, discordUserId));

  const warningCount = allWarnings.length;

  if (warningCount >= 3) {
    // حظر 4 أيام (96 ساعة)
    const bannedUntil = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    await db
      .update(botUsersTable)
      .set({ isBanned: true, bannedUntil, warningCount })
      .where(eq(botUsersTable.discordUserId, discordUserId));
    return { warningCount, banned: true };
  }

  await db
    .update(botUsersTable)
    .set({ warningCount })
    .where(eq(botUsersTable.discordUserId, discordUserId));
  return { warningCount, banned: false };
}

// ══════════════════════════════════════════════════════════════════════════════
//  AutoMod Setup
//  NOTE: البوت بيعمل قاعدتين في Discord AutoMod:
//  1. "Bot - Blocked Words"  — بيبلوك الكلام الممنوع في كل السيرفر
//  2. "Bot - Mention Block"  — بيبلوك @everyone/@here/@offers في كل السيرفر
//                              رول "منشن مفعّل" معفي من القاعدة — البوت بيديه
//                              لأصحاب الرومات اللي عندهم رصيد.
// ══════════════════════════════════════════════════════════════════════════════
async function setupAutoMod(guild: Guild): Promise<void> {
  try {
    const existingRules = await guild.autoModerationRules.fetch();

    // ── إنشاء / جلب رول "منشن مفعّل" ────────────────────────────────────
    await guild.roles.fetch();
    let mentionRole = guild.roles.cache.find((r) => r.name === MENTION_ACTIVE_ROLE_NAME) ?? null;
    if (!mentionRole) {
      mentionRole = await guild.roles.create({
        name:        MENTION_ACTIVE_ROLE_NAME,
        mentionable: false,
        reason:      "Dragon Bot — mention bypass role (exempted from AutoMod mention block)",
      });
      logger.info({ roleId: mentionRole.id }, "Created mention active role");
    }
    mentionActiveRoleId = mentionRole.id;

    // ── حذف قاعدة المنشنات القديمة لو موجودة ────────────────────────────
    const oldMentionRule = existingRules.find((r) => r.name === "Bot - Mention Balance Block");
    if (oldMentionRule) {
      await oldMentionRule.delete("Replaced by AutoMod mention block with role exemption");
      logger.info("Deleted old mention AutoMod rule");
    }

    // ── قاعدة الكلام الممنوع (سيرفر-wide) ──────────────────────────────
    const bannedWordRuleName = "Bot - Blocked Words";
    const existingBannedRule = existingRules.find((r) => r.name === bannedWordRuleName);
    if (existingBannedRule) {
      await existingBannedRule.edit({
        triggerMetadata: { keywordFilter: BANNED_WORDS, regexPatterns: [], allowList: [] },
        enabled: true,
      });
    } else {
      await guild.autoModerationRules.create({
        name: bannedWordRuleName,
        eventType: AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: BANNED_WORDS, regexPatterns: [], allowList: [] },
        actions: [{
          type: AutoModerationActionType.BlockMessage,
          metadata: { customMessage: "⛔ رسالتك اتبلوكت: كلام ممنوع." },
        }],
        enabled: true,
      });
    }

    // ── قاعدة حجب المنشنات (سيرفر-wide + role exemption) ────────────────
    // NOTE: رول "منشن مفعّل" معفي — البوت بيديه لأصحاب الرومات اللي عندهم رصيد.
    //       لما الكولداون يبدأ أو الرصيد يخلص، البوت يسحب الرول →
    //       أي محاولة منشن تانية بتطلع "Failed to send" مباشرةً.
    const mentionBlockRuleName = "Bot - Mention Block";
    const existingMentionBlock = existingRules.find((r) => r.name === mentionBlockRuleName);
    const mentionKeywords = ["@everyone", "@here", `<@&${OFFERS_ROLE_ID}>`];

    if (existingMentionBlock) {
      await existingMentionBlock.edit({
        triggerMetadata: { keywordFilter: mentionKeywords, regexPatterns: [], allowList: [] },
        exemptRoles:     [mentionRole.id],
        enabled:         true,
      });
    } else {
      await guild.autoModerationRules.create({
        name:        mentionBlockRuleName,
        eventType:   AutoModerationRuleEventType.MessageSend,
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: mentionKeywords, regexPatterns: [], allowList: [] },
        actions: [{
          type:     AutoModerationActionType.BlockMessage,
          metadata: { customMessage: "⛔ مش مسموح بالمنشن — رصيدك خلص أو الكولداون لسه شغال أو ده مش روم بتاعتك." },
        }],
        exemptRoles: [mentionRole.id],
        enabled:     true,
      });
    }

    logger.info({ mentionActiveRoleId }, "AutoMod rules configured");
  } catch (err) {
    logger.error({ err }, "Failed to setup AutoMod rules");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Mention Role Helpers
//  NOTE: البوت يدير رول "منشن مفعّل" بدل الكولداون اليدوي —
//        سحب الرول = "Failed to send" فوراً من Discord بدون ما الرسالة تتبعت.
// ══════════════════════════════════════════════════════════════════════════════

/** بيدي رول "منشن مفعّل" ليوزر لو مش عنده بالفعل */
async function grantMentionRole(guild: Guild, userId: string): Promise<void> {
  if (!mentionActiveRoleId) return;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.roles.cache.has(mentionActiveRoleId)) return;
    await member.roles.add(mentionActiveRoleId, "Eligible: room owner with balance");
  } catch (err) {
    logger.error({ err, userId }, "Failed to grant mention role");
  }
}

/** بيسحب رول "منشن مفعّل" نهائياً (رصيد خلص) */
async function revokeMentionRole(guild: Guild, userId: string): Promise<void> {
  if (!mentionActiveRoleId) return;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || !member.roles.cache.has(mentionActiveRoleId)) return;
    await member.roles.remove(mentionActiveRoleId, "Balance depleted");
  } catch (err) {
    logger.error({ err, userId }, "Failed to revoke mention role");
  }
}

/**
 * بيسحب رول "منشن مفعّل" مؤقتاً (كولداون) ثم بيرجّعه بعد cooldownMs
 * لو اليوزر لسه عنده رصيد.
 */
async function revokeMentionRoleWithCooldown(
  guild: Guild,
  userId: string,
  cooldownMs: number,
): Promise<void> {
  if (!mentionActiveRoleId) return;
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (member.roles.cache.has(mentionActiveRoleId)) {
      await member.roles.remove(mentionActiveRoleId, "Mention sent — cooldown active");
    }
    setTimeout(async () => {
      try {
        const u = await getOrCreateUser(userId, "");
        const hasBalance =
          u.everyoneBalance > 0 || u.hereBalance > 0 || u.offersBalance > 0;
        if (!hasBalance) return; // الرصيد خلص — ما يرجعش الرول
        const freshMember = await guild.members.fetch(userId).catch(() => null);
        if (!freshMember || freshMember.roles.cache.has(mentionActiveRoleId!)) return;
        await freshMember.roles.add(mentionActiveRoleId!, "Cooldown expired — balance still available");
      } catch (err) {
        logger.error({ err, userId }, "Failed to re-grant mention role after cooldown");
      }
    }, cooldownMs);
  } catch (err) {
    logger.error({ err, userId }, "Failed to revoke mention role for cooldown");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Message Checks — فحوصات الرسائل
// ══════════════════════════════════════════════════════════════════════════════

/** بيتحقق لو الرسالة فيها لينك خارجي أو دعوة Discord */
function containsLink(text: string): boolean {
  return /https?:\/\/|discord\.gg\/|www\./i.test(text);
}

/**
 * بيتحقق لو في أكتر من منشن واحد (@everyone / @here / رول معين) في الرسالة.
 * NOTE: منشن واحد كده بيعدي عادي — الأكتر من واحد في رسالة واحدة ده اسبام.
 */
function containsSpamMention(text: string): boolean {
  const matches = text.match(/@(everyone|here|&\d+)/g);
  return matches !== null && matches.length > 1;
}

/**
 * بيشوف لو حد بيحاول يشفر كلامه يدوياً عشان يعدي على AutoMod.
 * NOTE: البوت نفسه بيعمل تشفير بسيط (encodeArabicFranco) على الكلام الممنوع
 *       ويبعته في الشانل بدل الكلام الأصلي — ده عشان الأدمن يعرف إيه اللي قاله.
 *       أي شخص يحاول يشفر بنفسه بياخد تحذير.
 */
function isSelfEncoded(text: string): boolean {
  const stripped = text.replace(/\s/g, "");
  return (
    /^[A-Za-z0-9+/=]{20,}$/.test(stripped) ||               // base64-like
    /[\u0600-\u06FF][19][\u0600-\u06FF]/.test(text) ||       // أرقام وسط عربي
    /[\u0600-\u06FF]ـ،[\u0600-\u06FF]/.test(text) ||         // فواصل إجبارية
    /[\u0600-\u06FF](\/\/\/|III)[\u0600-\u06FF]/.test(text)  // فواصل شكلية
  );
}

/**
 * بيشفر الكلام العربي بطريقة بسيطة عشان يتبعت في الشانل بدل الكلام المباشر.
 * بيحوّل بعض الأحرف لأرقام ويكسر الكلمات الطويلة بفاصل.
 * NOTE: الغرض هو الـ logging فقط — مش سكيورتي.
 */
function encodeArabicFranco(text: string): string {
  const map: Record<string, string> = {
    "ا": "1", "أ": "1", "إ": "1", "آ": "1", "ى": "1", "و": "9",
  };
  let r = "";
  for (const ch of text) r += map[ch] ?? ch;
  return r.replace(/[\u0600-\u06FF\d]{5,}/gu, (w) => {
    const m = Math.floor(w.length / 2);
    return w.slice(0, m) + "ـ،" + w.slice(m);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Helpers — أدوات مساعدة
// ══════════════════════════════════════════════════════════════════════════════

/** إيموجيات الـ embed الرئيسية */
const STAR_EMOJI  = "<a:yellowstar:1496143576759930901>";
const MONEY_EMOJI = "<a:Peepo_Money:1521134361829707778>";

/**
 * بيحول نص عادي لنص Bold بيستخدم Unicode Mathematical Bold letters.
 * NOTE: بيشتغل فقط مع A-Z و a-z — الأحرف العربية والأرقام بتتحط كما هي.
 */
function toBold(text: string): string {
  return [...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90)  return String.fromCodePoint(c - 65 + 0x1d400); // A-Z
    if (c >= 97 && c <= 122) return String.fromCodePoint(c - 97 + 0x1d41a); // a-z
    return ch;
  }).join("");
}

/**
 * بيعمل label للروم بالشكل الخاص بالمتجر.
 * مثال: "gold" → "엔𝐆𝐨𝐥𝐝."
 */
function roomLabel(name: string): string {
  return `엔${toBold(name.charAt(0).toUpperCase() + name.slice(1))}.`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Asset Paths — مسارات الصور
//  NOTE: الصور اتوضع في artifacts/api-server/assets/
//        لو الصورة مش موجودة، البوت يبعت الـ embed بدون صورة بشكل graceful.
//        الصور المطلوبة:
//          dragon.webp           — صورة التنين (thumbnail في صفحة معلومات الروم)
//          dragon_banner.webp    — بانر المتجر الرئيسي + رسالة تأكيد إنشاء الروم
//          dragon_text_banner.webp — بانر أسعار الفئات
// ══════════════════════════════════════════════════════════════════════════════
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../assets");

const DRAGON_IMAGE_PATH       = path.join(ASSETS_DIR, "dragon.webp");
const DRAGON_BANNER_PATH      = path.join(ASSETS_DIR, "dragon_banner.webp");
const DRAGON_TEXT_BANNER_PATH = path.join(ASSETS_DIR, "dragon_text_banner.webp");

// ══════════════════════════════════════════════════════════════════════════════
//  فئات المتجر
//  NOTE: الترتيب هنا هو نفس ترتيب الأزرار في بانل المتجر الرئيسي.
//        لو عايز تضيف فئة جديدة، ضيفها هنا وعمل handler لها في InteractionCreate.
// ══════════════════════════════════════════════════════════════════════════════
const SHOP_CATEGORIES = ["المتاجر", "الطلبيات", "المزاد", "الرتب", "الإضافات"] as const;

// ══════════════════════════════════════════════════════════════════════════════
//  رتب Discord لكل نوع روم
//  NOTE: الـ Role IDs دي بتتظهر في embed معلومات الروم كـ @mention للرتبة.
//        لو أضفت نوع روم جديد، ضيف ID رتبته هنا.
// ══════════════════════════════════════════════════════════════════════════════
const ROOM_ROLE_IDS: Record<string, string> = {
  "nightmare": "1492979372913856602",
  "emerald":   "1492979375165935821",
  "diamond":   "1492979376457908358",
  "platinum":  "1521865792705269951",
  "gold":      "1492979377787506808",
  "sliver":    "1492979380522324208",
  "bronze":    "1492979382216556614",
};

// ══════════════════════════════════════════════════════════════════════════════
//  الرومات الثابتة
//  NOTE: دي الرومات الأساسية اللي بتتحط في المتجر دايماً.
//        بتتـ sync للـ DB كل ما البوت يشتغل (syncStaticRooms).
//        أي تعديل في البيانات هنا هياخد أفكت بعد restart البوت.
//
//        الأسعار اللي قيمتها 0: محتاجة تتعدل إما عن طريق:
//          1. تغييرها هنا مباشرة ثم restart
//          2. أمر /addroom (بيضيف روم جديد) — مش بيعدل الـ static
//          3. UPDATE يدوي في DB
//
//        discordCategoryId: الـ ID بتاع الكاتيجوري في Discord اللي الرومات بتتعمل تحتها.
//          null = مش ربط لكاتيجوري محددة (الروم هيتعمل بدون parent category)
// ══════════════════════════════════════════════════════════════════════════════
interface StaticRoom {
  name:              string;
  price:             number;   // السعر الصافي بالكريدت (بدون عمولة ProBot)
  decorations:       string;   // إيموجي الزخرفة اللي بيظهر في اسم الروم
  offersCount:       number;   // عدد منشنات @offers المرفقة مع الروم
  hereCount:         number;   // عدد منشنات @here المرفقة مع الروم
  everyoneCount:     number;   // عدد منشنات @everyone المرفقة مع الروم
  discordCategoryId: string | null; // Discord Category ID
}

const STATIC_ROOMS: Record<string, StaticRoom[]> = {
  "المتاجر": [
    {
      name: "bronze",    price: 2000000,  decorations: "🧱",
      offersCount: 10, hereCount: 7,  everyoneCount: 5,
      discordCategoryId: "1521225661145026560",
    },
    {
      name: "sliver",    price: 5000000,  decorations: "🪽",
      offersCount: 13, hereCount: 10, everyoneCount: 7,
      discordCategoryId: "1521225659362312232",
    },
    {
      name: "gold",      price: 10000000, decorations: "👑",
      offersCount: 15, hereCount: 13, everyoneCount: 10,
      discordCategoryId: "1521225658410336427",
    },
    {
      name: "platinum",  price: 25000000, decorations: "☄️",
      offersCount: 19, hereCount: 15, everyoneCount: 13,
      discordCategoryId: "1521225657546182867",
    },
    {
      name: "diamond",   price: 30000000, decorations: "💎",
      offersCount: 23, hereCount: 19, everyoneCount: 15,
      discordCategoryId: "1521225656099143851",
    },
    {
      name: "emerald",   price: 40000000, decorations: "🐉",
      offersCount: 29, hereCount: 25, everyoneCount: 20,
      discordCategoryId: "1521225655562272869",
    },
    {
      name: "nightmare", price: 50000000, decorations: "🐦‍🔥",
      offersCount: 35, hereCount: 30, everyoneCount: 30,
      discordCategoryId: "1521225654807433277",
    },
  ],
  "الطلبيات": [], // TODO: أضف رومات هنا لو احتجت
  "المزاد":   [], // TODO: أضف رومات هنا لو احتجت
  "الرتب":    [], // TODO: أضف رومات هنا لو احتجت
  "الإضافات": [], // الإضافات مش رومات — أسعارها في addon_prices table
};

/** الترتيب المرئي للرومات في /synccategories (من الأعلى للأقل) */
const ROOM_CATEGORY_ORDER = ["nightmare", "emerald", "diamond", "platinum", "gold", "sliver", "bronze"];

/**
 * ID الكاتيجوري في Discord اللي التذاكر (tickets) بتتعمل تحتها.
 * NOTE: لو الكاتيجوري دي اتحذفت من السيرفر، إنشاء التذاكر هيفشل.
 *       في الحالة دي عمل كاتيجوري جديدة وعدّل الـ ID هنا.
 */
const TICKETS_CATEGORY_ID = "1493289978225098752";

/**
 * ID رول @offers — بيتمنشن في رومات العملاء وبينزل من رصيدهم.
 * NOTE: لو الرول اتحذف أو تغير ID-ه، عدّل هنا.
 */
const OFFERS_ROLE_ID = "1519711578964889760";

// ══════════════════════════════════════════════════════════════════════════════
//  المزاد — الإعدادات والحالة والأدوات
//  NOTE: الرومات ثابتة في Discord (مش البوت اللي بيعملها).
//        البوت بس بيقفلها ويفتحها حسب الجدول.
// ══════════════════════════════════════════════════════════════════════════════

/** IDs الشانلات المخصصة للمزادات (3 رومات جاهزة في Discord) */
const AUCTION_ROOM_CHANNEL_IDS: readonly string[] = [
  "1523801341292712051",
  "1523801346195853396",
  "1523801354139598969",
];

/** ID كاتيجوري المزادات والطلبيات */
const AUCTION_CATEGORY_ID = "1523801337933074688";

/** ID الشانل اللي بيتبعت فيه إمبيد الأسعار والجدول */
const AUCTION_INFO_CHANNEL_ID = "1523801349655888076";

/** أنواع المزاد وأسعارها (سعر صافي بدون عمولة ProBot) */
const AUCTION_TYPES = {
  everyone: { label: "@everyone", emoji: "📢", price: 10_000_000 },
  here:     { label: "@here",     emoji: "📣", price: 5_000_000  },
  offers:   { label: "@offers",   emoji: "🔔", price: 3_000_000  },
} as const;
type AuctionType = keyof typeof AUCTION_TYPES;

/**
 * IDs رسائل شانل المزاد الثابتة (تتعبى من الشانل عند كل restart).
 * - auctionInfoMsgId    → رسالة الشرح (ما تتبعتش تاني أبداً)
 * - auctionScheduleMsgId → رسالة المواعيد المحجوزة (تتعدّل تلقائياً)
 */
let auctionInfoMsgId:     string | null = null;
let auctionScheduleMsgId: string | null = null;

// ── Mention Active Role ──────────────────────────────────────────────────────
// NOTE: رول بيديه البوت لأصحاب الرومات اللي عندهم رصيد.
//       بيكون exempted من قاعدة AutoMod "Bot - Mention Block".
//       لو الرصيد خلص أو الكولداون شغال → البوت يسحب الرول → "Failed to send".
const MENTION_ACTIVE_ROLE_NAME = "منشن مفعّل";
const MENTION_COOLDOWN_MS      = 30 * 60 * 1000; // 30 دقيقة كولداون بعد كل منشن
let   mentionActiveRoleId: string | null = null;

/** حالة المزادات الجارية (في الذاكرة — تُصفَّر عند restart البوت) */
const activeAuctions = new Map<string, {
  scheduleId:        number;
  auctionType:       AuctionType;
  highestBid:        number;
  highestBidderId:   string | null;
  highestBidderName: string | null;
  inactivityTimer:   ReturnType<typeof setTimeout>;
}>();

/** بيرجع التاريخ والساعة الحالية بتوقيت القاهرة */
function getCairoTime(): { date: string; hour: number } {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const h    = parseInt(
    now.toLocaleString("en-US", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }),
    10,
  );
  return { date, hour: h === 24 ? 0 : h };
}

/** ساعة (0–23) → نص قصير مقروء مثل "12ص" / "3م" */
function hourToLabel(h: number): string {
  if (h === 0)  return "12ص";
  if (h === 12) return "12م";
  return h < 12 ? `${h}ص` : `${h - 12}م`;
}

/** قفل شانل المزاد — يمنع الإرسال ويبقي الرؤية */
async function lockAuctionRoom(guild: Guild, channelId: string): Promise<void> {
  const ch = guild.channels.cache.get(channelId);
  if (!ch || ch.type !== ChannelType.GuildText) return;
  await (ch as TextChannel).permissionOverwrites
    .edit(guild.roles.everyone, { SendMessages: false, AddReactions: false })
    .catch(() => {});
}

/** فتح شانل المزاد — يسمح للكل بالإرسال والتفاعل */
async function unlockAuctionRoom(guild: Guild, channelId: string): Promise<void> {
  const ch = guild.channels.cache.get(channelId);
  if (!ch || ch.type !== ChannelType.GuildText) return;
  await (ch as TextChannel).permissionOverwrites
    .edit(guild.roles.everyone, { SendMessages: true, AddReactions: true })
    .catch(() => {});
}

/**
 * إنهاء المزاد بعد دقيقتين صمت.
 * 1. يعلن الفائز (أو غياب العروض).
 * 2. يقفل الروم.
 * 3. بعد 30 دقيقة: يمسح الشات.
 */
async function endAuction(guild: Guild, channelId: string): Promise<void> {
  const auction = activeAuctions.get(channelId);
  if (!auction) return;
  clearTimeout(auction.inactivityTimer);
  activeAuctions.delete(channelId);

  const ch = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!ch) return;

  if (auction.highestBidderId) {
    await ch.send(
      `🎉 **انتهى المزاد!**\n` +
      `👑 الفائز: <@${auction.highestBidderId}>\n` +
      `💰 المبلغ الفائز: **${auction.highestBid.toLocaleString()}** كريدت\n\n` +
      `⏳ سيتواصل معك الأدمن لإتمام الدفع وتنفيذ المزاد.`,
    );
  } else {
    await ch.send(`📭 **انتهى المزاد** دون أي عروض.`);
  }

  await db.update(auctionSchedulesTable).set({
    status:       "completed",
    winnerUserId: auction.highestBidderId ?? undefined,
    winningBid:   auction.highestBid > 0 ? auction.highestBid : undefined,
  }).where(eq(auctionSchedulesTable.id, auction.scheduleId)).catch(() => {});

  await lockAuctionRoom(guild, channelId);

  // بعد 30 دقيقة: امسح الشات لإعادة الاستعداد
  setTimeout(async () => {
    try {
      let msgs = await ch.messages.fetch({ limit: 100 });
      while (msgs.size > 0) {
        await ch.bulkDelete(msgs, true).catch(() => {});
        if (msgs.size < 100) break;
        msgs = await ch.messages.fetch({ limit: 100 });
      }
      logger.info({ channelId }, "Auction channel cleared after 30 min");
    } catch (err) {
      logger.error({ err, channelId }, "Failed to clear auction channel");
    }
  }, 30 * 60 * 1000);
}

/**
 * تشغيل مزاد:
 * 1. يحدّث الستاتوس لـ active (عشان الـ scheduler ما يشغّله تاني).
 * 2. يفتح الروم.
 * 3. يبعت رسالة البداية.
 * 4. يبدأ عداد دقيقتين صمت.
 */
async function startAuction(
  guild: Guild,
  schedule: { id: number; auctionType: string; discordUserId: string; roomChannelId: string },
): Promise<void> {
  const channelId = schedule.roomChannelId;
  const aType     = schedule.auctionType as AuctionType;
  const typeCfg   = AUCTION_TYPES[aType];
  if (!typeCfg) return;

  // أولاً: حدّث ستاتوس لـ active لمنع التشغيل المزدوج
  await db.update(auctionSchedulesTable)
    .set({ status: "active" })
    .where(eq(auctionSchedulesTable.id, schedule.id))
    .catch(() => {});

  await unlockAuctionRoom(guild, channelId);

  const ch = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!ch) return;

  const mentionText =
    aType === "everyone" ? "@everyone" :
    aType === "here"     ? "@here"     : `<@&${OFFERS_ROLE_ID}>`;

  await ch.send(
    `${typeCfg.emoji} **بدأ المزاد!**\n\n` +
    `**النوع:** ${typeCfg.label}\n` +
    `**المشتري:** <@${schedule.discordUserId}>\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💬 اكتب سعرك (أرقام فقط) — من يكتب أعلى سعر يفوز!\n` +
    `⏱️ المزاد ينتهي بعد **دقيقتين** من آخر عرض.\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${mentionText}`,
  );

  const inactivityTimer = setTimeout(
    () => endAuction(guild, channelId).catch((e) => logger.error({ e }, "endAuction error")),
    2 * 60 * 1000,
  );

  activeAuctions.set(channelId, {
    scheduleId:        schedule.id,
    auctionType:       aType,
    highestBid:        0,
    highestBidderId:   null,
    highestBidderName: null,
    inactivityTimer,
  });

  logger.info({ scheduleId: schedule.id, channelId, aType }, "Auction started");
}

/**
 * Scheduler — بيتشغل كل 30 ثانية.
 * لو في مزاد مجدول ووقته جه → يشغّله.
 */
function startAuctionScheduler(guild: Guild): void {
  setInterval(async () => {
    try {
      const { date, hour } = getCairoTime();
      const due = await db.select().from(auctionSchedulesTable).where(
        and(
          eq(auctionSchedulesTable.status, "scheduled"),
          eq(auctionSchedulesTable.scheduledDate, date),
          eq(auctionSchedulesTable.scheduledHour, hour),
        ),
      );
      for (const sched of due) {
        if (!sched.roomChannelId) continue;
        if (activeAuctions.has(sched.roomChannelId)) continue;
        await startAuction(guild, {
          id:            sched.id,
          auctionType:   sched.auctionType,
          discordUserId: sched.discordUserId,
          roomChannelId: sched.roomChannelId,
        });
      }
    } catch (err) {
      logger.error({ err }, "Auction scheduler error");
    }
  }, 30_000);
}

/**
 * بيبني إمبيد المواعيد المحجوزة لليوم الحالي.
 * بيتنادى من refreshAuctionScheduleMsg.
 */
async function buildScheduleEmbed(): Promise<EmbedBuilder> {
  const { date } = getCairoTime();

  const schedules = await db
    .select()
    .from(auctionSchedulesTable)
    .where(
      and(
        eq(auctionSchedulesTable.scheduledDate, date),
        ne(auctionSchedulesTable.status, "cancelled"),
      ),
    );

  const statusEmoji: Record<string, string> = {
    pending_payment: "⏳",
    scheduled:       "✅",
    active:          "🔴",
    completed:       "✔️",
  };
  const typeEmoji: Record<string, string> = {
    everyone: "📢",
    here:     "📣",
    offers:   "🔔",
  };

  schedules.sort((a, b) => a.scheduledHour - b.scheduledHour);

  const embed = new EmbedBuilder()
    .setTitle(`📅 المواعيد المحجوزة — ${date} (توقيت القاهرة)`)
    .setColor(0x5865f2)
    .setFooter({ text: `آخر تحديث: ${new Date().toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" })}` });

  if (schedules.length === 0) {
    embed.setDescription("📭 لا توجد مواعيد محجوزة اليوم.");
  } else {
    const lines = schedules.map((s) => {
      const st   = statusEmoji[s.status] ?? "❓";
      const te   = typeEmoji[s.auctionType] ?? "";
      const type = AUCTION_TYPES[s.auctionType as AuctionType]?.label ?? s.auctionType;
      return `${st} **${hourToLabel(s.scheduledHour)}** — ${te} ${type} — <@${s.discordUserId}>`;
    });
    embed.setDescription(lines.join("\n"));
  }
  return embed;
}

/**
 * يحدّث رسالة المواعيد المحجوزة في شانل المزاد.
 * - لو الرسالة موجودة: يعدّلها.
 * - لو مش موجودة: يبعتها جديدة ويحفظ الـ ID.
 */
async function refreshAuctionScheduleMsg(guild: Guild): Promise<void> {
  try {
    const infoCh = await guild.channels.fetch(AUCTION_INFO_CHANNEL_ID).catch(() => null) as TextChannel | null;
    if (!infoCh) return;

    const embed = await buildScheduleEmbed();

    if (auctionScheduleMsgId) {
      const existing = await infoCh.messages.fetch(auctionScheduleMsgId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed] });
        return;
      }
      // الرسالة اتحذفت — هنبعت جديدة
      auctionScheduleMsgId = null;
    }

    const sent = await infoCh.send({ embeds: [embed] });
    auctionScheduleMsgId = sent.id;
  } catch (err) {
    logger.error({ err }, "refreshAuctionScheduleMsg error");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  syncStaticRooms — مزامنة الرومات مع DB
//  NOTE: بيتنادى كل ما البوت يشتغل (ClientReady).
//        لو الروم موجود في DB: بيعدّل البيانات (السعر / المنشنات / الـ CategoryID).
//        لو مش موجود: بيعمله insert جديد.
//        ده بيضمن إن أي تعديل في STATIC_ROOMS يتطبق تلقائياً على DB بعد restart.
// ══════════════════════════════════════════════════════════════════════════════
async function syncStaticRooms(): Promise<void> {
  for (const [category, rooms] of Object.entries(STATIC_ROOMS)) {
    for (const room of rooms) {
      const existing = await db
        .select()
        .from(roomsTable)
        .where(and(eq(roomsTable.name, room.name), eq(roomsTable.category, category)))
        .then((r) => r[0]);

      if (existing) {
        await db
          .update(roomsTable)
          .set({
            price:             String(room.price),
            decorations:       room.decorations,
            offersCount:       room.offersCount,
            hereCount:         room.hereCount,
            everyoneCount:     room.everyoneCount,
            discordCategoryId: room.discordCategoryId,
          })
          .where(eq(roomsTable.id, existing.id));
      } else {
        await db.insert(roomsTable).values({
          name:              room.name,
          category,
          price:             String(room.price),
          decorations:       room.decorations,
          offersCount:       room.offersCount,
          hereCount:         room.hereCount,
          everyoneCount:     room.everyoneCount,
          discordCategoryId: room.discordCategoryId,
        });
      }
    }
  }
  logger.info("Static rooms synced to DB");
}

// ══════════════════════════════════════════════════════════════════════════════
//  sendShopPanel — بانل المتجر الرئيسي
//  NOTE: بيتبعت في الشانل اللي فيه /shop.
//        مش ephemeral — كل الناس بيشوفوه.
//        بيعمل زرار لكل فئة في SHOP_CATEGORIES.
// ══════════════════════════════════════════════════════════════════════════════
async function sendShopPanel(channel: TextChannel) {
  const description =
    `جميع الأسعار لكل نوع يمكنك ضغط الأسفل ${MONEY_EMOJI}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `لرؤية الأسعار :\n\n` +
    SHOP_CATEGORIES.map((cat) => `${MONEY_EMOJI} **أسعار ${cat}**`).join("\n") +
    `\n\n━━━━━━━━━━━━━━━━━━━━`;

  const categoryButtons = SHOP_CATEGORIES.map((cat) =>
    new ButtonBuilder()
      .setCustomId(`shopcat_${cat}`)
      .setLabel(`أسعار ${cat}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1496143576759930901", name: "yellowstar", animated: true })
  );

  // تقسيم الأزرار على ActionRows (max 5 أزرار لكل row)
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < categoryButtons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...categoryButtons.slice(i, i + 5)));
  }

  const files: AttachmentBuilder[] = [];
  const guildIconURL = channel.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;

  const embed = new EmbedBuilder()
    .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
    .setDescription(description)
    .setColor(0x00bfff)
    .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

  // أضف بانر لو موجود (dragon_banner.webp)
  if (fs.existsSync(DRAGON_BANNER_PATH)) {
    files.push(new AttachmentBuilder(DRAGON_BANNER_PATH, { name: "dragon_banner.webp" }));
    embed.setImage("attachment://dragon_banner.webp");
  }

  await channel.send({ embeds: [embed], files, components: rows });
}

// ══════════════════════════════════════════════════════════════════════════════
//  ClientReady — عند تشغيل البوت
// ══════════════════════════════════════════════════════════════════════════════
client.once(Events.ClientReady, async () => {
  try {
  logger.info({ username: client.user?.tag }, "Discord bot is ready");

  // ── تسجيل Slash Commands ──────────────────────────────────────────────────
  // NOTE: الأوامر بتتسجل على مستوى السيرفر (Guild Commands) مش Global.
  //       ده بيخليها تظهر فوراً بدون الانتظار 1 ساعة اللي بياخدها Global Commands.
  //       لو عايز تنقلها لـ Global: غير Routes.applicationGuildCommands لـ Routes.applicationCommands
  const commands = [
    // ── أوامر عامة ──────────────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName("shop")
      .setDescription("افتح بانل شراء الرومات"),

    new SlashCommandBuilder()
      .setName("myroom")
      .setDescription("شوف الرومات اللي عندك"),

    new SlashCommandBuilder()
      .setName("transferroom")
      .setDescription("حول ملكية الروم لشخص تاني")
      .addUserOption((o) =>
        o.setName("user").setDescription("الشخص اللي هتحول له الروم").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("room").setDescription("اسم الروم").setRequired(true)
      ),

    // ── أوامر الأونر/Admin ────────────────────────────────────────────────
    new SlashCommandBuilder()
      .setName("addroom")
      .setDescription("👑 [أونر] أضف نوع روم جديد للمتجر")
      .addStringOption((o) => o.setName("name").setDescription("اسم نوع الروم").setRequired(true))
      .addStringOption((o) => o.setName("category").setDescription("الكاتيجوري").setRequired(true))
      .addNumberOption((o) => o.setName("price").setDescription("السعر الصافي (بدون عمولة ProBot)").setRequired(true))
      .addStringOption((o) => o.setName("decorations").setDescription("الزخارف (إيموجي)").setRequired(false))
      .addStringOption((o) => o.setName("category_id").setDescription("Discord Category ID").setRequired(false))
      .addIntegerOption((o) => o.setName("offers").setDescription("عدد منشنات @offers").setRequired(false))
      .addIntegerOption((o) => o.setName("here").setDescription("عدد منشنات @here").setRequired(false))
      .addIntegerOption((o) => o.setName("everyone").setDescription("عدد منشنات @everyone").setRequired(false)),

    new SlashCommandBuilder()
      .setName("listrooms")
      .setDescription("👑 [أونر] شوف كل الرومات في DB"),

    new SlashCommandBuilder()
      .setName("synccategories")
      .setDescription("👑 [أونر] اعرض ربط الرومات بالكاتيجوريهات"),

    new SlashCommandBuilder()
      .setName("setcategoryid")
      .setDescription("👑 [أونر] اربط روم بكاتيجوري موجودة")
      .addIntegerOption((o) =>
        o.setName("room_id").setDescription("ID الروم (من /listrooms)").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("category_id").setDescription("Discord Category ID").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("deleteroom")
      .setDescription("👑 [أونر] احذف نوع روم من المتجر")
      .addIntegerOption((o) =>
        o.setName("id").setDescription("ID الروم (من /listrooms)").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("setaddonprice")
      .setDescription("👑 [أونر] حدد سعر إضافة معينة")
      .addStringOption((o) =>
        o.setName("addon")
          .setDescription("الإضافة")
          .setRequired(true)
          // الـ choices بتتجنى تلقائياً من ADDONS array
          // NOTE: Discord بيسمح بحد أقصى 25 choice لكل option
          //       الإضافات دلوقتي 21 فما فيش مشكلة، لو زادت عن 25 ستحتاج نهج تاني
          .addChoices(...ADDONS.map((a) => ({ name: a.label, value: a.key })))
      )
      .addNumberOption((o) =>
        o.setName("price").setDescription("السعر (كريدت) — رقم موجب").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("givebalance")
      .setDescription("👑 [أونر] أضف رصيد منشنات ليوزر")
      .addUserOption((o) => o.setName("user").setDescription("اليوزر").setRequired(true))
      .addStringOption((o) =>
        o.setName("type")
          .setDescription("نوع المنشن")
          .setRequired(true)
          .addChoices(
            { name: "@offers",   value: "offers" },
            { name: "@here",     value: "here" },
            { name: "@everyone", value: "everyone" },
          )
      )
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("الكمية المراد إضافتها").setRequired(true)
      ),
  ];

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user!.id, GUILD_ID),
      { body: commands.map((c) => c.toJSON()) }
    );
    logger.info("Slash commands registered");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }

  // ── مزامنة الرومات ────────────────────────────────────────────────────────
  await syncStaticRooms();

  // ── إعداد AutoMod (كلام ممنوع فقط) ──────────────────────────────────────
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (guild) {
    await setupAutoMod(guild);

    // ── تهيئة رومات المزاد (قفلها عند بدء التشغيل) ───────────────────────
    for (const roomId of AUCTION_ROOM_CHANNEL_IDS) {
      await lockAuctionRoom(guild, roomId);
    }

    // ── استعادة IDs رسائل شانل المزاد بعد الـ restart ────────────────────
    try {
      const infoCh = await guild.channels.fetch(AUCTION_INFO_CHANNEL_ID).catch(() => null) as TextChannel | null;
      if (infoCh) {
        const recent = await infoCh.messages.fetch({ limit: 50 }).catch(() => null);
        if (recent) {
          for (const m of recent.values()) {
            if (m.author.id !== client.user!.id) continue;
            if (!auctionInfoMsgId && m.embeds.some((e) => e.title?.includes("كيف يعمل"))) {
              auctionInfoMsgId = m.id;
            }
            if (!auctionScheduleMsgId && m.embeds.some((e) => e.title?.includes("المواعيد المحجوزة"))) {
              auctionScheduleMsgId = m.id;
            }
            if (auctionInfoMsgId && auctionScheduleMsgId) break;
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to restore auction info message IDs");
    }

    startAuctionScheduler(guild);

    // تحديث المواعيد فور التشغيل ثم كل 5 دقايق
    await refreshAuctionScheduleMsg(guild);
    setInterval(() => refreshAuctionScheduleMsg(guild).catch(() => {}), 5 * 60 * 1000);

    logger.info({ auctionInfoMsgId, auctionScheduleMsgId }, "Auction rooms locked and scheduler started");
  }
  } catch (err) {
    logger.error({ err }, "Fatal error during bot initialization — exiting");
    process.exit(1);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  MessageCreate — معالجة الرسائل
// ══════════════════════════════════════════════════════════════════════════════
client.on(Events.MessageCreate, async (message: Message) => {
  try {

  // ── رسائل البوتات (ProBot فقط) ──────────────────────────────────────────
  if (message.author.bot) {
    if (!message.guild) return;
    // تجاهل أي بوت تاني غير ProBot — بيمنع الـ spoofing
    if (message.author.id !== PROBOT_USER_ID) return;

    const channel    = message.channel as TextChannel;
    const searchText = [
      message.content,
      ...(message.embeds ?? []).map((e) =>
        [e.description ?? "", e.title ?? "", ...e.fields.map((f) => f.value)].join(" ")
      ),
    ].join(" ");

    logger.info({ channelId: channel.id, text: searchText.slice(0, 200) }, "ProBot message");

    // ابحث عن رسالة التحويل الناجح من ProBot
    // NOTE: نص ProBot بيكون: "X has transferred `1053` to Y" أو قريب منه.
    //       الـ regex بيقرأ المبلغ ويتحقق من وجود OWNER_ID في النص كمستلم.
    //       ده بيمنع إن أي تحويل لشخص تاني يعتبر دفع صالح.
    const match = searchText.match(/has transferred\s+`?\$?([\d,]+(?:\.\d+)?)`?/i);
    if (match) {
      const paid = parseFloat(match[1].replace(/,/g, ""));
      // ── تحقق من المستلم ──────────────────────────────────────────────────
      // ProBot بيكتب ID المستلم في الرسالة — نتأكد إن الأونر هو المستلم
      const recipientInMsg = searchText.includes(OWNER_ID);
      if (!recipientInMsg) {
        logger.warn({ channelId: channel.id, paid }, "ProBot transfer detected but recipient is not OWNER_ID — ignoring");
        return;
      }
      logger.info({ paid, channelId: channel.id }, "Detected ProBot transfer");

      // ابحث عن تذكرة pending في نفس الشانل
      const ticketPurchase = await db
        .select()
        .from(purchasesTable)
        .where(
          and(
            eq(purchasesTable.ticketChannelId, channel.id),
            eq(purchasesTable.status, "pending")
          )
        )
        .then((rows) => rows[0]);

      // لو مفيش تذكرة شراء عادية، ابحث في تذاكر المزادات
      if (!ticketPurchase) {
        const auctionTicket = await db
          .select()
          .from(auctionSchedulesTable)
          .where(
            and(
              eq(auctionSchedulesTable.ticketChannelId, channel.id),
              eq(auctionSchedulesTable.status, "pending_payment"),
            ),
          )
          .then((r) => r[0]);

        if (!auctionTicket) return;

        // totalPrice في الـ DB هو مبلغ التحويل الكامل (gross).
        // ProBot بيبلغ عن المبلغ الـ net اللي وصل للمستلم.
        // نحوّل totalPrice لـ net قبل المقارنة: net = gross * (1 - fee)
        const requiredAmt    = Number(auctionTicket.totalPrice);
        const netRequiredAmt = Math.floor(requiredAmt * (1 - PROBOT_FEE));
        if (paid >= netRequiredAmt) {
          await db.update(auctionSchedulesTable)
            .set({ status: "scheduled" })
            .where(eq(auctionSchedulesTable.id, auctionTicket.id));

          const aType   = auctionTicket.auctionType as AuctionType;
          const typeCfg = AUCTION_TYPES[aType];
          await channel.send(
            `✅ **تم تأكيد حجز المزاد!**\n\n` +
            `<@${auctionTicket.discordUserId}>\n` +
            `**النوع:** ${typeCfg?.emoji ?? ""} ${typeCfg?.label ?? aType}\n` +
            `**الموعد:** ${hourToLabel(auctionTicket.scheduledHour)} — ${auctionTicket.scheduledDate} (توقيت القاهرة)\n\n` +
            `⏰ سيبدأ مزادك تلقائياً في الموعد المحدد. ✅`,
          );
          // أغلق التذكرة بعد 5 ثواني
          setTimeout(() => channel.delete("Auction ticket closed after payment").catch(() => {}), 5000);
          // حدّث رسالة المواعيد فور تأكيد الحجز
          if (message.guild) refreshAuctionScheduleMsg(message.guild).catch(() => {});
        } else {
          await channel.send(
            `⚠️ المبلغ المحوّل (${paid}) أقل من المطلوب (${netRequiredAmt}). يرجى إعادة التحويل.`,
          );
        }
        return;
      }

      // totalPrice في الـ DB هو gross transfer amount.
      // ProBot بيبلغ عن الـ net المستلم — نحوّله قبل المقارنة.
      const requiredAmount    = Number(ticketPurchase.totalPrice);
      const netRequiredAmount = Math.floor(requiredAmount * (1 - PROBOT_FEE));

      if (paid >= netRequiredAmount) {
        // ✅ الدفع صح — انتظر اسم الروم
        await db
          .update(purchasesTable)
          .set({ status: "awaiting_room_name" })
          .where(eq(purchasesTable.id, ticketPurchase.id));

        await channel.send(
          `✅ تم التحقق من التحويل!\n\n` +
          `<@${ticketPurchase.discordUserId}> اكتب اسم الروم اللي عايزه هنا ⬇️\n` +
          `*(بالعربي أو الانجليزي، بدون زخارف أو إيموجيات)*`
        );
      } else {
        // ❌ المبلغ ناقص
        await channel.send(
          `⚠️ المبلغ المحوّل (${paid}) أقل من المطلوب (${requiredAmount} مع عمولة ProBot 5%). يرجى إعادة التحويل بالمبلغ الصحيح.`
        );
      }
    }
    return;
  }

  // من هنا: رسائل البشر فقط
  if (!message.guild) return;

  const userId   = message.author.id;
  const username = message.author.username;
  const content  = message.content;
  const channel  = message.channel as TextChannel;

  // ── !منشن — عرض رصيد المنشنات ────────────────────────────────────────────
  // الصيغة: !منشن          → رصيد المرسل نفسه
  //         !منشن @يوزر   → رصيد يوزر تاني
  if (content.trim() === "!منشن" || content.trim().startsWith("!منشن ")) {
    const mentionedUser = message.mentions.users.first() ?? null;
    const targetUser    = mentionedUser ?? message.author;
    const targetId      = targetUser.id;

    const u            = await getOrCreateUser(targetId, targetUser.username);
    const guildIconURL = message.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const avatarURL    = targetUser.displayAvatarURL({ extension: "png", size: 256 });

    const DIV = "ـﮩ════════════════ﮩـ";

    // فحص صلاحية الأدمنستراتور للتارجت — cache أولاً ثم fetch كـ fallback
    const targetMember =
      message.guild?.members.cache.get(targetId) ??
      (await message.guild?.members.fetch(targetId).catch(() => null)) ??
      null;
    const targetIsAdmin = targetMember?.permissions.has(PermissionFlagsBits.Administrator) ?? false;

    // الأدمن: رصيد لا نهائي → عرض ∞ وتلوين ملكي
    const everyoneDisplay = targetIsAdmin ? "∞" : String(u.everyoneBalance);
    const hereDisplay     = targetIsAdmin ? "∞" : String(u.hereBalance);
    const offersDisplay   = targetIsAdmin ? "∞" : String(u.offersBalance);

    const hasAny     = targetIsAdmin || u.everyoneBalance > 0 || u.hereBalance > 0 || u.offersBalance > 0;
    const embedColor = targetIsAdmin ? 0x9b59b6 : hasAny ? 0xffd700 : 0x2b2d31;
    // بنفسجي للأدمن، ذهبي لو في رصيد، رمادي لو فاضي

    const targetLabel = mentionedUser
      ? `رصيد **${targetUser.globalName ?? targetUser.username}** من المنشنات`
      : `رصيدك يا <@${userId}> من المنشنات`;

    const balanceEmbed = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle("📊 رصيد المنشنات")
      .setDescription(`> ${targetLabel}\n> ${DIV}`)
      .setColor(embedColor)
      .addFields(
        {
          name:   `${STAR_EMOJI} @everyone`,
          value:  `> ${MONEY_EMOJI} الرصيد : **${everyoneDisplay}** منشن\n> ${DIV}`,
          inline: false,
        },
        {
          name:   `${STAR_EMOJI} @here`,
          value:  `> ${MONEY_EMOJI} الرصيد : **${hereDisplay}** منشن\n> ${DIV}`,
          inline: false,
        },
        {
          name:   `${STAR_EMOJI} @offers`,
          value:  `> <@&${OFFERS_ROLE_ID}>\n> ${MONEY_EMOJI} الرصيد : **${offersDisplay}** منشن\n> ${DIV}`,
          inline: false,
        },
      )
      .setThumbnail(avatarURL)
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p", iconURL: guildIconURL });

    const bannerFiles: AttachmentBuilder[] = [];
    if (fs.existsSync(DRAGON_TEXT_BANNER_PATH)) {
      bannerFiles.push(new AttachmentBuilder(DRAGON_TEXT_BANNER_PATH, { name: "dragon_text_banner.webp" }));
      balanceEmbed.setImage("attachment://dragon_text_banner.webp");
    }

    await message.reply({ embeds: [balanceEmbed], files: bannerFiles }).catch(() => {});
    return;
  }

  // ── فحص الحظر ────────────────────────────────────────────────────────────
  const banned = await isUserBanned(userId);
  if (banned) {
    await message.delete().catch(() => {});
    try { await message.author.send("❌ أنت محظور حالياً."); } catch {}
    return;
  }

  // ── تتبع عروض المزاد في رومات المزاد ────────────────────────────────────
  // NOTE: رومات المزاد مش في purchasesTable — بنتحقق من activeAuctions مباشرة.
  //       أي رسالة في الروم وقت المزاد بتعتبر عرض، حتى لو مش رقم.
  //       لو الروم مقفول (مش في activeAuctions) → تجاهل الرسالة.
  if (AUCTION_ROOM_CHANNEL_IDS.includes(channel.id)) {
    const auction = activeAuctions.get(channel.id);
    if (!auction) return; // الروم مقفول أو مفيش مزاد جاري

    const bidAmount = parseInt(content.replace(/[,٬،_\s]/g, ""), 10);
    if (!isNaN(bidAmount) && bidAmount > 0 && bidAmount > auction.highestBid) {
      auction.highestBid        = bidAmount;
      auction.highestBidderId   = userId;
      auction.highestBidderName = username;

      // أعد تشغيل عداد الصمت
      clearTimeout(auction.inactivityTimer);
      auction.inactivityTimer = setTimeout(
        () => endAuction(message.guild!, channel.id).catch((e) => logger.error({ e }, "endAuction error")),
        2 * 60 * 1000,
      );

      await message.react("✅").catch(() => {});
    }
    return; // لا تعالج رسائل رومات المزاد بأي منطق آخر
  }

  // ── فحص رومات العملاء (completed purchases) ──────────────────────────────
  // NOTE: البوت بيراقب رسائل الشانلات اللي اشتراها العملاء فقط.
  //       الشانلات التانية (زي التذاكر) بيراقبها بس لاسم الروم (تحت).
  const roomPurchase = await db
    .select({ id: purchasesTable.id, ownerId: purchasesTable.discordUserId })
    .from(purchasesTable)
    .where(
      and(
        eq(purchasesTable.discordRoomId, channel.id),
        eq(purchasesTable.status, "completed")
      )
    )
    .then((rows) => rows[0] ?? null);

  const isRoomChannel = roomPurchase !== null;

  if (isRoomChannel) {
    // ── حذف اللينكات ────────────────────────────────────────────────────
    if (containsLink(content)) {
      await message.delete().catch(() => {});
      const { warningCount, banned: nowBanned } = await addWarning(
        userId, username, "نشر لينك", content
      );
      try {
        await message.author.send(
          nowBanned
            ? `⛔ تم حظرك لمدة 4 أيام (وصلت 3 تحذيرات). آخر تحذير: نشر لينك.`
            : `⚠️ تحذير ${warningCount}/3: رسالتك اتحذفت — ممنوع نشر لينكات.`
        );
      } catch {}
      return;
    }

    // ── حذف الكلام المشفر يدوياً ─────────────────────────────────────────
    if (isSelfEncoded(content)) {
      await message.delete().catch(() => {});
      // أبعت النسخة المشفرة في الشانل للـ logging
      await channel.send(`🔒 رسالة مشفرة من ${message.author}:\n${encodeArabicFranco(content)}`);
      const { warningCount, banned: nowBanned } = await addWarning(
        userId, username, "محاولة تشفير الكلام يدوياً", content
      );
      try {
        await message.author.send(
          nowBanned
            ? `⛔ تم حظرك لمدة 4 أيام (وصلت 3 تحذيرات).`
            : `⚠️ تحذير ${warningCount}/3: البوت بيشفر الكلام تلقائياً، ممنوع تشفره بنفسك.`
        );
      } catch {}
      return;
    }

    // ── حذف اسبام المنشنات ───────────────────────────────────────────────
    if (containsSpamMention(content)) {
      await message.delete().catch(() => {});
      const { warningCount, banned: nowBanned } = await addWarning(
        userId, username, "اسبام منشن", content
      );
      try {
        await message.author.send(
          nowBanned
            ? `⛔ تم حظرك لمدة 4 أيام (وصلت 3 تحذيرات). آخر تحذير: اسبام منشنات.`
            : `⚠️ تحذير ${warningCount}/3: ممنوع اسبام المنشنات.`
        );
      } catch {}
      return;
    }

    // ── فلتر المنشنات (جوه الرومات فقط) ────────────────────────────────────
    // NOTE: AutoMod "Bot - Mention Block" بيحجب المنشنات لأي حد مالوش رول "منشن مفعّل".
    //       لو الرسالة وصلت هنا معناها:
    //         • صاحب الروم عنده الرول (مش محتاج نفحص الملكية يدوياً)
    //         • الكولداون خلص (الرول اتسحب أثناء الكولداون)
    //       البوت هنا بيخصم الرصيد ويدير الرول بعد المنشن.
    const usedEveryone = /@everyone/i.test(content);
    const usedHere     = /@here/i.test(content);
    const usedOffers   = new RegExp(`<@&${OFFERS_ROLE_ID}>`).test(content);

    if (usedEveryone || usedHere || usedOffers) {
      // ── الأدمنستراتور: رصيد لا نهائي — لا خصم ولا كولداون ──────────────
      // message.member متاح دايماً في guild messages — بنستخدمه مباشرة بدون fetch
      const isAdmin = (message.member ?? await message.guild.members.fetch(userId).catch(() => null))
        ?.permissions.has(PermissionFlagsBits.Administrator) ?? false;

      if (!isAdmin) {
        const u = await getOrCreateUser(userId, username);

        // خصم الرصيد
        const updates: Partial<{
          everyoneBalance: number;
          hereBalance:     number;
          offersBalance:   number;
        }> = {};
        if (usedEveryone) updates.everyoneBalance = Math.max(0, u.everyoneBalance - 1);
        if (usedHere)     updates.hereBalance     = Math.max(0, u.hereBalance     - 1);
        if (usedOffers)   updates.offersBalance   = Math.max(0, u.offersBalance   - 1);

        await db
          .update(botUsersTable)
          .set(updates)
          .where(eq(botUsersTable.discordUserId, userId));

        const newEveryone = updates.everyoneBalance ?? u.everyoneBalance;
        const newHere     = updates.hereBalance     ?? u.hereBalance;
        const newOffers   = updates.offersBalance   ?? u.offersBalance;
        const hasBalance  = newEveryone > 0 || newHere > 0 || newOffers > 0;

        if (!hasBalance) {
          // رصيد خلص — اسحب الرول نهائياً → أي محاولة منشن تانية بتطلع "Failed to send"
          await revokeMentionRole(message.guild, userId);
          try {
            await message.author.send(
              `⛔ رصيد المنشنات بتاعك خلص — مش هتقدر تمنشن تاني لحد ما الأدمن يجدد.\n` +
              `📊 رصيدك الحالي:\n` +
              `  📢 @everyone: ${newEveryone}\n` +
              `  📣 @here: ${newHere}\n` +
              `  🔔 @offers: ${newOffers}`
            );
          } catch {}
        } else {
          // في رصيد — اسحب الرول 30 دقيقة (كولداون) ثم رجعه تلقائياً
          await revokeMentionRoleWithCooldown(message.guild, userId, MENTION_COOLDOWN_MS);
          const lines: string[] = [];
          if (usedEveryone) lines.push(`📢 @everyone: تبقى لك ${newEveryone} منشن`);
          if (usedHere)     lines.push(`📣 @here: تبقى لك ${newHere} منشن`);
          if (usedOffers)   lines.push(`🔔 @offers: تبقى لك ${newOffers} منشن`);
          lines.push(`⏳ الكولداون: 30 دقيقة قبل ما تقدر تمنشن تاني.`);
          try { await message.author.send(lines.join("\n")); } catch {}
        }
      }
      // الأدمن: مفيش خصم ولا إشعار — المنشن بيمشي بحرية كاملة
    }
  }

  // ── انتظار اسم الروم بعد تأكيد الدفع ────────────────────────────────────
  // NOTE: بعد ما ProBot يتحقق، الـ status بيبقى "awaiting_room_name".
  //       الرسالة الجاية من نفس اليوزر في نفس الشانل بتعتبر اسم الروم.
  //       الاسم بيتعمله format تلقائي: `私 ₊˚✧{زخرفة}| {الاسم}`
  const pendingPurchase = await db
    .select()
    .from(purchasesTable)
    .where(
      and(
        eq(purchasesTable.discordUserId, userId),
        eq(purchasesTable.status, "awaiting_room_name"),
        eq(purchasesTable.ticketChannelId, channel.id)
      )
    )
    .then((rows) => rows[0]);

  if (pendingPurchase) {
    const rawName = content.trim();
    if (!rawName || rawName.length > 32) {
      await channel.send(`⚠️ الاسم ده مش صالح. اكتب اسم بين 1 و 32 حرف.`);
      return;
    }

    const [room] = await db
      .select()
      .from(roomsTable)
      .where(eq(roomsTable.id, pendingPurchase.roomId));
    if (!room) return;

    const finalName  = `私 ₊˚✧${room.decorations || ""}| ${rawName}`;
    const totalPrice = calcTransferAmount(Number(room.price));

    await db
      .update(purchasesTable)
      .set({
        customRoomName: finalName,
        status:         "awaiting_room_creation",
        totalPrice:     String(totalPrice),
      })
      .where(eq(purchasesTable.id, pendingPurchase.id));

    try {
      // إنشاء شانل الروم في Discord
      const newChannel = await message.guild.channels.create({
        name:   finalName,
        type:   ChannelType.GuildText,
        parent: room.discordCategoryId ?? undefined,
        permissionOverwrites: [
          { id: message.guild.id, deny:  [PermissionFlagsBits.ViewChannel] },
          {
            id:    userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.MentionEveryone,
            ],
          },
        ],
      });

      // حدّث DB بـ Discord channel ID والـ status
      await db
        .update(purchasesTable)
        .set({ discordRoomId: newChannel.id, status: "completed" })
        .where(eq(purchasesTable.id, pendingPurchase.id));

      // أضف رصيد المنشنات للعميل
      const u = await getOrCreateUser(userId, username);
      if (room.offersCount > 0)
        await db
          .update(botUsersTable)
          .set({ offersBalance: u.offersBalance + room.offersCount })
          .where(eq(botUsersTable.discordUserId, userId));
      if (room.hereCount > 0)
        await db
          .update(botUsersTable)
          .set({ hereBalance: u.hereBalance + room.hereCount })
          .where(eq(botUsersTable.discordUserId, userId));
      if (room.everyoneCount > 0)
        await db
          .update(botUsersTable)
          .set({ everyoneBalance: u.everyoneBalance + room.everyoneCount })
          .where(eq(botUsersTable.discordUserId, userId));

      // دي رول "منشن مفعّل" — بيخلي صاحب الروم يمنشن ويعدي على AutoMod
      await grantMentionRole(message.guild, userId);

      // رسالة التهنئة
      const bannerFiles: AttachmentBuilder[] = [];
      const completionEmbed = new EmbedBuilder()
        .setTitle("🎉 تم إنشاء الروم!")
        .setDescription(
          `**اسم الروم:** ${finalName}\n` +
          `**رابط الروم:** <#${newChannel.id}>\n\n` +
          `${STAR_EMOJI} مبروك! الروم بتاعك اتعمل بنجاح.`
        )
        .setColor(0x00ff88);

      if (fs.existsSync(DRAGON_BANNER_PATH)) {
        bannerFiles.push(new AttachmentBuilder(DRAGON_BANNER_PATH, { name: "dragon_banner.webp" }));
        completionEmbed.setImage("attachment://dragon_banner.webp");
      }

      await channel.send({ embeds: [completionEmbed], files: bannerFiles });
    } catch (err) {
      logger.error({ err }, "Failed to create Discord room channel");
      await channel.send(`❌ حصل خطأ وقت إنشاء الروم. تواصل مع الأدمن.`);
    }
    return;
  }
  } catch (err) {
    logger.error({ err, messageId: message.id }, "Unhandled error in MessageCreate");
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  InteractionCreate — معالجة التفاعلات (أزرار + Slash Commands)
// ══════════════════════════════════════════════════════════════════════════════
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {

  // ══════════════════════════════════════════════════════════════════════════
  //  BUTTONS
  // ══════════════════════════════════════════════════════════════════════════

  // ── زرار فئة المتجر (shopcat_*) ─────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("shopcat_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const category = interaction.customId.replace("shopcat_", "");

    // ── فئة الإضافات (معالجة خاصة) ────────────────────────────────────────
    if (category === "الإضافات") {
      // NOTE: الإضافات مش رومات من DB — أسعارها في addon_prices table.
      //       عشان كده بنعمل embed خاص بيها مع أزرار كل إضافة.
      const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
      const embed = new EmbedBuilder()
        .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
        .setTitle("أسعار الإضافات")
        .setDescription("أختر زر بالأسفل لمعرفة سعر الإضافة")
        .setColor(0x00bfff)
        .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

      if (guildIconURL) embed.setThumbnail(guildIconURL);

      const files: AttachmentBuilder[] = [];
      if (fs.existsSync(DRAGON_TEXT_BANNER_PATH)) {
        files.push(new AttachmentBuilder(DRAGON_TEXT_BANNER_PATH, { name: "dragon_text_banner.webp" }));
        embed.setImage("attachment://dragon_text_banner.webp");
      }

      // بناء الأزرار من ADDONS array
      // ⚠️ راجع ملاحظة RTL في تعريف ADDONS array فوق
      const addonButtons = ADDONS.map((a) =>
        new ButtonBuilder()
          .setCustomId(`addoninfo_${a.key}`)
          .setLabel(a.label)
          .setEmoji(PEEPO_EMOJI)
          .setStyle(ButtonStyle.Secondary)
      );

      const components: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < addonButtons.length; i += 5) {
        components.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(...addonButtons.slice(i, i + 5))
        );
      }

      await interaction.editReply({ embeds: [embed], files, components });
      return;
    }

    // ── فئة المزاد (معالجة خاصة — يبعت الإمبيد في شانل المزاد) ──────────
    if (category === "المزاد") {
      const guild        = interaction.guild!;
      const guildIconURL = guild.iconURL({ extension: "png", size: 256 }) ?? undefined;

      // الإيموجيز المخصصة
      const STAR_EMOJI   = "<a:1111426691680714782:1484902226169430220>";
      const ZOOM_EMOJI   = "<a:aPES_Zoom:1496140715988619274>";
      const PROBOT_EMOJI_AUC = "<a:by_ez_84:1495757810569449603>";

      // ── الإمبيد المزخرف ─────────────────────────────────────────────────
      const auctionEmbed = new EmbedBuilder()
        .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
        .setTitle("🏷️ الـ آسعار الـ مـزادات")
        .setColor(0xffd700)
        .addFields(
          {
            name:   "ـﮩ══════════════ﮩـ",
            value:
              `${STAR_EMOJI} **منشن :**\n` +
              `• ${ZOOM_EMOJI} @everyone\n\n` +
              `💰 **السعر :**\n` +
              `• ${PROBOT_EMOJI_AUC} 10,000,000\n` +
              `ـﮩ══════════════ﮩـ`,
            inline: false,
          },
          {
            name:   "\u200b",
            value:
              `${STAR_EMOJI} **منشن :**\n` +
              `• ${ZOOM_EMOJI} @here\n\n` +
              `💰 **السعر :**\n` +
              `• ${PROBOT_EMOJI_AUC} 5,000,000\n` +
              `ـﮩ══════════════ﮩـ`,
            inline: false,
          },
          {
            name:   "\u200b",
            value:
              `${STAR_EMOJI} **منشن :**\n` +
              `• ${ZOOM_EMOJI} <@&${OFFERS_ROLE_ID}>\n\n` +
              `💰 **السعر :**\n` +
              `• ${PROBOT_EMOJI_AUC} 3,000,000\n` +
              `ـﮩ══════════════ﮩـ`,
            inline: false,
          },
        )
        .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

      if (guildIconURL) auctionEmbed.setThumbnail(guildIconURL);

      const auctionFiles: AttachmentBuilder[] = [];
      if (fs.existsSync(DRAGON_TEXT_BANNER_PATH)) {
        auctionFiles.push(new AttachmentBuilder(DRAGON_TEXT_BANNER_PATH, { name: "dragon_text_banner.webp" }));
        auctionEmbed.setImage("attachment://dragon_text_banner.webp");
      }

      // ── أزرار الشراء (تنزل في نفس الشانل اللي ضغط فيه اليوزر) ──────────
      const buyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("auctype_everyone").setLabel("@everyone").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("auctype_here").setLabel("@here").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("auctype_offers").setLabel("@offers").setStyle(ButtonStyle.Primary),
      );

      // الأسعار + أزرار الشراء → نفس الشانل اللي ضغط فيه (رد عادي مش ephemeral)
      await interaction.editReply({ embeds: [auctionEmbed], files: auctionFiles, components: [buyRow] });

      // ── شانل المزاد: شرح — مرة واحدة فقط للأبد ─────────────────────────
      // NOTE: auctionInfoMsgId بيتعبى من الشانل عند كل restart.
      //       لو موجود → ما نبعتش تاني. المواعيد تتحدث تلقائياً في رسالة منفصلة.
      if (!auctionInfoMsgId) {
        const infoCh = await guild.channels.fetch(AUCTION_INFO_CHANNEL_ID).catch(() => null) as TextChannel | null;
        if (infoCh) {
          const howEmbed = new EmbedBuilder()
            .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
            .setTitle("🎰 كيف يعمل المزاد؟")
            .setDescription(
              `1️⃣ اختر نوع المزاد\n` +
              `2️⃣ اختر الموعد المناسب\n` +
              `3️⃣ ادفع عبر ProBot ويتأكد حجزك\n` +
              `4️⃣ في الموعد، البوت يفتح روم المزاد تلقائياً\n` +
              `5️⃣ الناس تتزايد — من يكتب أعلى مبلغ يفوز!\n` +
              `⏱️ المزاد ينتهي بعد **دقيقتين** من آخر عرض`,
            )
            .setColor(0x5865f2)
            .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

          if (guildIconURL) howEmbed.setThumbnail(guildIconURL);

          const sent = await infoCh.send({ embeds: [howEmbed] });
          auctionInfoMsgId = sent.id;

          // بعت رسالة المواعيد مباشرة بعد الشرح
          await refreshAuctionScheduleMsg(guild);
        }
      }
      return;
    }

    // ── فئات الرومات العادية ────────────────────────────────────────────────
    const rooms = await db.select().from(roomsTable).where(eq(roomsTable.category, category));

    if (rooms.length === 0) {
      await interaction.editReply({ content: `📭 مفيش رومات في فئة **${category}** دلوقتي.` });
      return;
    }

    const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const embed = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle("تفاصيل الانواع")
      .setDescription("لمعرفة تفاصيل النوع اضغط على النوع الذي تريده")
      .setColor(0x00bfff)
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

    if (guildIconURL) embed.setThumbnail(guildIconURL);

    const files: AttachmentBuilder[] = [];
    if (fs.existsSync(DRAGON_TEXT_BANNER_PATH)) {
      files.push(new AttachmentBuilder(DRAGON_TEXT_BANNER_PATH, { name: "dragon_text_banner.webp" }));
      embed.setImage("attachment://dragon_text_banner.webp");
    }

    const roomButtons = rooms.map((r) =>
      new ButtonBuilder()
        .setCustomId(`roominfo_${r.id}`)
        .setLabel(roomLabel(r.name))
        .setStyle(ButtonStyle.Secondary)
    );

    const components: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < roomButtons.length; i += 5) {
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(...roomButtons.slice(i, i + 5))
      );
    }

    await interaction.editReply({ embeds: [embed], files, components });
    return;
  }

  // ── زرار سعر إضافة (addoninfo_*) ────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("addoninfo_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const key   = interaction.customId.replace("addoninfo_", "") as AddonKey;
    const addon = ADDONS.find((a) => a.key === key);

    if (!addon) {
      await interaction.editReply({ content: "❌ الإضافة مش موجودة." });
      return;
    }

    // ── حالة خاصة: سعر منشن هير → embed أسعار المنشنات الثلاثة + زر شراء ──
    if (key === "mention_here") {
      const MENTION_PRICES = {
        here:     5_000_000,
        everyone: 15_000_000,
        offers:   8_000_000,
      };
      const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
      const DIV          = "ـﮩ══════════════════ﮩـ";
      const STAR         = "<a:1111426691680714782:1484902226169430220>";
      const MONEY        = MONEY_EMOJI;

      const pricesEmbed = new EmbedBuilder()
        .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
        .setTitle("💰 أسعار المنشنات")
        .setColor(0xffd700)
        .addFields(
          {
            name:   `${STAR} @here`,
            value:  `> ${MONEY} السعر : **${MENTION_PRICES.here.toLocaleString()}** كريدت / منشن\n> ${DIV}`,
            inline: false,
          },
          {
            name:   `${STAR} @everyone`,
            value:  `> ${MONEY} السعر : **${MENTION_PRICES.everyone.toLocaleString()}** كريدت / منشن\n> ${DIV}`,
            inline: false,
          },
          {
            name:   `${STAR} @offers`,
            value:  `> <@&${OFFERS_ROLE_ID}>\n> ${MONEY} السعر : **${MENTION_PRICES.offers.toLocaleString()}** كريدت / منشن\n> ${DIV}`,
            inline: false,
          },
        )
        .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p", iconURL: guildIconURL });

      if (guildIconURL) pricesEmbed.setThumbnail(guildIconURL);

      const bannerFiles: AttachmentBuilder[] = [];
      if (fs.existsSync(DRAGON_TEXT_BANNER_PATH)) {
        bannerFiles.push(new AttachmentBuilder(DRAGON_TEXT_BANNER_PATH, { name: "dragon_text_banner.webp" }));
        pricesEmbed.setImage("attachment://dragon_text_banner.webp");
      }

      const buyMentionBtn = new ButtonBuilder()
        .setCustomId("buy_mention")
        .setLabel("🛒 شراء منشن")
        .setStyle(ButtonStyle.Primary);

      await interaction.editReply({
        embeds:     [pricesEmbed],
        files:      bannerFiles,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buyMentionBtn)],
      });
      return;
    }

    // اجيب السعر من DB
    const [row]     = await db.select().from(addonPricesTable).where(eq(addonPricesTable.key, key));
    const rawPrice   = row ? Number(row.price) : 0;
    const price      = Number.isFinite(rawPrice) ? rawPrice : 0;
    // لو السعر 0 أو مش متحدد → "غير محدد"
    const priceText  = price > 0 ? `${Math.round(price)} كريدت` : "غير محدد";

    const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const embed = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle(addon.label)
      .setColor(0x00bfff)
      .addFields({ name: "💰 السعر", value: priceText, inline: false })
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── زرار شراء منشن (buy_mention) → يفتح مودال الكمية والنوع ──────────────
  if (interaction.isButton() && interaction.customId === "buy_mention") {
    const modal = new ModalBuilder()
      .setCustomId("modal_buy_mention")
      .setTitle("🛒 شراء منشن");

    const typeInput = new TextInputBuilder()
      .setCustomId("mention_type")
      .setLabel("نوع المنشن (هير / إيفري / متاجر)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("هير")
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(10);

    const qtyInput = new TextInputBuilder()
      .setCustomId("mention_qty")
      .setLabel("عايز تشتري كم منشن")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("1")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(5);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(qtyInput),
    );

    await interaction.showModal(modal);
    return;
  }

  // ── مودال شراء منشن (modal_buy_mention) ──────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === "modal_buy_mention") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const MENTION_PRICES: Record<string, number> = {
      هير:    5_000_000,
      إيفري:  15_000_000,
      ايفري:  15_000_000,   // بديل بدون همزة
      متاجر:  8_000_000,
      أوفرز:  8_000_000,
      اوفرز:  8_000_000,
      offers: 8_000_000,
      here:   5_000_000,
      everyone: 15_000_000,
    };

    const typeRaw  = interaction.fields.getTextInputValue("mention_type").trim().toLowerCase();
    const qtyRaw   = interaction.fields.getTextInputValue("mention_qty").trim().replace(/[,،٬]/g, "");
    const qty      = parseInt(qtyRaw, 10);

    if (isNaN(qty) || qty <= 0) {
      await interaction.editReply({ content: "❌ أدخل عدد صحيح أكبر من صفر." });
      return;
    }

    const pricePerMention = MENTION_PRICES[typeRaw];
    if (!pricePerMention) {
      const validTypes = "**هير** / **إيفري** / **متاجر**";
      await interaction.editReply({ content: `❌ نوع المنشن غلط. الأنواع المتاحة: ${validTypes}` });
      return;
    }

    const netPrice    = pricePerMention * qty;
    const transferAmt = calcTransferAmount(netPrice);
    const cmd         = `C <@${OWNER_ID}> ${transferAmt}`;

    const typeLabel: Record<string, string> = {
      هير: "@here", إيفري: "@everyone", ايفري: "@everyone",
      متاجر: "@offers", أوفرز: "@offers", اوفرز: "@offers",
      offers: "@offers", here: "@here", everyone: "@everyone",
    };
    const label = typeLabel[typeRaw] ?? typeRaw;

    const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const resultEmbed  = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle("📋 أمر تحويل المنشن")
      .setColor(0xffd700)
      .addFields(
        { name: "🏷️ النوع",          value: label,                                            inline: true },
        { name: "🔢 الكمية",          value: String(qty),                                      inline: true },
        { name: "💰 السعر الصافي",    value: `${netPrice.toLocaleString()} كريدت`,              inline: false },
        { name: "💸 مبلغ التحويل",    value: `${transferAmt.toLocaleString()} (شامل عمولة 5%)`, inline: false },
        { name: "📋 أمر التحويل",     value: `\`${cmd}\``,                                     inline: false },
      )
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p", iconURL: guildIconURL });

    await interaction.editReply({ embeds: [resultEmbed] });
    // بعث أمر التحويل كرسالة نصية ثانية عشان ينسخه بسهولة
    await interaction.followUp({ content: cmd, flags: MessageFlags.Ephemeral });
    return;
  }

  // ── زرار نوع المزاد (auctype_*) — يعرض الأوقات المتاحة ─────────────────
  if (interaction.isButton() && interaction.customId.startsWith("auctype_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const aType = interaction.customId.replace("auctype_", "") as AuctionType;
    if (!AUCTION_TYPES[aType]) {
      await interaction.editReply({ content: "❌ نوع مزاد غير معروف." });
      return;
    }
    const typeCfg = AUCTION_TYPES[aType];

    const { date, hour: currentHour } = getCairoTime();

    // اجلب الحجوزات النشطة لليوم ده
    const booked = await db
      .select({ scheduledHour: auctionSchedulesTable.scheduledHour, roomChannelId: auctionSchedulesTable.roomChannelId })
      .from(auctionSchedulesTable)
      .where(
        and(
          eq(auctionSchedulesTable.scheduledDate, date),
          ne(auctionSchedulesTable.status, "cancelled"),
        ),
      );

    // لكل ساعة: كم غرفة محجوزة؟ (الـ 3 هم الحد الأقصى)
    const roomsPerHour = new Map<number, number>();
    for (const b of booked) {
      roomsPerHour.set(b.scheduledHour, (roomsPerHour.get(b.scheduledHour) ?? 0) + 1);
    }

    // الأوقات المتاحة: من الساعة التالية للحالية حتى 23
    const availableHours = Array.from({ length: 24 }, (_, i) => i)
      .filter((h) => h > currentHour && (roomsPerHour.get(h) ?? 0) < AUCTION_ROOM_CHANNEL_IDS.length);

    if (availableHours.length === 0) {
      await interaction.editReply({
        content:
          `📭 مفيش أوقات متاحة لليوم ده لنوع **${typeCfg.label}**.\n` +
          `كل الرومات محجوزة أو الوقت خلص. حاول تاني بكرة!`,
      });
      return;
    }

    const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const embed = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle(`${typeCfg.emoji} اختر موعد المزاد — ${typeCfg.label}`)
      .setDescription(
        `**السعر:** ${typeCfg.price.toLocaleString()} كريدت\n` +
        `**التاريخ:** ${date} (بتوقيت القاهرة)\n\n` +
        `اضغط على الوقت اللي يناسبك ⬇️\n` +
        `*(الوقت المختار = بداية المزاد)*`,
      )
      .setColor(0xffd700)
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

    if (guildIconURL) embed.setThumbnail(guildIconURL);

    // أزرار الأوقات (max 20 = 4 rows × 5)
    const slotButtons = availableHours.slice(0, 20).map((h) => {
      const remaining = AUCTION_ROOM_CHANNEL_IDS.length - (roomsPerHour.get(h) ?? 0);
      return new ButtonBuilder()
        .setCustomId(`aucslot_${aType}|${date}|${h}`)
        .setLabel(`${hourToLabel(h)} (${remaining} متاح)`)
        .setStyle(ButtonStyle.Success);
    });

    const slotRows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < slotButtons.length; i += 5) {
      slotRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...slotButtons.slice(i, i + 5)));
    }

    await interaction.editReply({ embeds: [embed], components: slotRows });
    return;
  }

  // ── زرار حجز موعد مزاد (aucslot_*) — ينشئ تذكرة دفع ────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("aucslot_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const parts = interaction.customId.replace("aucslot_", "").split("|");
    if (parts.length !== 3) {
      await interaction.editReply({ content: "❌ بيانات الموعد غلط." });
      return;
    }
    const [aType, targetDate, hourStr] = parts as [AuctionType, string, string];
    const targetHour = parseInt(hourStr, 10);

    if (!AUCTION_TYPES[aType] || isNaN(targetHour)) {
      await interaction.editReply({ content: "❌ بيانات المزاد غير صحيحة." });
      return;
    }

    const userId   = interaction.user.id;
    const username = interaction.user.username;

    if (await isUserBanned(userId)) {
      await interaction.editReply({ content: "❌ أنت محظور ولا تستطيع الشراء." });
      return;
    }

    // تحقق من التوافر مرة تانية (race condition protection)
    const nowBooked = await db
      .select({ roomChannelId: auctionSchedulesTable.roomChannelId })
      .from(auctionSchedulesTable)
      .where(
        and(
          eq(auctionSchedulesTable.scheduledDate, targetDate),
          eq(auctionSchedulesTable.scheduledHour, targetHour),
          ne(auctionSchedulesTable.status, "cancelled"),
        ),
      );
    const bookedRoomIds = nowBooked.map((b) => b.roomChannelId).filter(Boolean) as string[];
    const assignedRoom  = AUCTION_ROOM_CHANNEL_IDS.find((id) => !bookedRoomIds.includes(id));

    if (!assignedRoom) {
      await interaction.editReply({ content: "❌ هذا الوقت امتلأ للتو. اختر وقتاً آخر." });
      return;
    }

    const typeCfg     = AUCTION_TYPES[aType];
    const transferAmt = calcTransferAmount(typeCfg.price);
    const guild       = interaction.guild!;

    // أنشئ شانل تذكرة المزاد
    const ticketChannel = await guild.channels.create({
      name:   `auction-${username}-${aType}`,
      type:   ChannelType.GuildText,
      parent: TICKETS_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.id,             deny:  [PermissionFlagsBits.ViewChannel] },
        { id: userId,               allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: guild.roles.everyone, deny:  [PermissionFlagsBits.ViewChannel] },
      ],
    });

    // سجّل الحجز في DB
    const [auctionRecord] = await db
      .insert(auctionSchedulesTable)
      .values({
        discordUserId:   userId,
        discordUsername: username,
        auctionType:     aType,
        scheduledDate:   targetDate,
        scheduledHour:   targetHour,
        status:          "pending_payment",
        roomChannelId:   assignedRoom,
        ticketChannelId: ticketChannel.id,
        totalPrice:      String(transferAmt),
      })
      .returning();

    const transferCommand = `C <@${OWNER_ID}> ${transferAmt}`;
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`🎰 تذكرة مزاد — ${typeCfg.label}`)
      .setDescription(
        `مرحباً <@${userId}>! 👋\n\n` +
        `**نوع المزاد:** ${typeCfg.emoji} ${typeCfg.label}\n` +
        `**الموعد:** ${hourToLabel(targetHour)} — ${targetDate} (توقيت القاهرة)\n` +
        `**السعر:** ${typeCfg.price.toLocaleString()} كريدت\n` +
        `**مبلغ التحويل (مع عمولة ProBot 5%):** \`${transferAmt}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 **أمر التحويل:**\n\`${transferCommand}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `1️⃣ انسخ الأمر وبعثه في سيرفر ProBot\n` +
        `2️⃣ البوت هيتأكد تلقائياً ويغلق التذكرة\n` +
        `3️⃣ في الموعد المحدد يبدأ مزادك تلقائياً ✅`,
      )
      .setColor(0xffd700);

    const closeBtnA = new ButtonBuilder()
      .setCustomId(`close_auction_ticket_${auctionRecord.id}`)
      .setLabel("🔒 إلغاء الحجز")
      .setStyle(ButtonStyle.Danger);

    await ticketChannel.send({
      content:    `<@${userId}>`,
      embeds:     [ticketEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtnA)],
    });

    await interaction.editReply({ content: `✅ تم إنشاء تذكرة الحجز! <#${ticketChannel.id}>` });
    return;
  }

  // ── زرار المواعيد المحجوزة (auction_schedule_view) ──────────────────────
  if (interaction.isButton() && interaction.customId === "auction_schedule_view") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { date } = getCairoTime();

    const schedules = await db
      .select()
      .from(auctionSchedulesTable)
      .where(
        and(
          eq(auctionSchedulesTable.scheduledDate, date),
          ne(auctionSchedulesTable.status, "cancelled"),
        ),
      );

    if (schedules.length === 0) {
      await interaction.editReply({ content: `📭 **مفيش مواعيد محجوزة اليوم** (${date})` });
      return;
    }

    const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const embed = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle(`📅 المواعيد المحجوزة — ${date}`)
      .setColor(0x5865f2)
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

    if (guildIconURL) embed.setThumbnail(guildIconURL);

    const statusEmoji: Record<string, string> = {
      pending_payment: "⏳",
      scheduled:       "✅",
      active:          "🔴",
      completed:       "✔️",
    };

    const typeEmoji: Record<string, string> = {
      everyone: "📢",
      here:     "📣",
      offers:   "🔔",
    };

    // رتّب حسب الساعة
    schedules.sort((a, b) => a.scheduledHour - b.scheduledHour);

    const lines = schedules.map((s) => {
      const st   = statusEmoji[s.status] ?? "❓";
      const te   = typeEmoji[s.auctionType] ?? "";
      const time = `${hourToLabel(s.scheduledHour)}:00`;
      const type = AUCTION_TYPES[s.auctionType as AuctionType]?.label ?? s.auctionType;
      return `${st} **${time}** — ${te} ${type} — <@${s.discordUserId}>`;
    });

    embed.setDescription(lines.join("\n"));

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // ── زرار إلغاء تذكرة مزاد (close_auction_ticket_*) ─────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("close_auction_ticket_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const auctionId = parseInt(interaction.customId.replace("close_auction_ticket_", ""), 10);
    const [aRecord] = await db.select().from(auctionSchedulesTable).where(eq(auctionSchedulesTable.id, auctionId));
    if (!aRecord) { await interaction.editReply({ content: "❌ الحجز مش موجود." }); return; }

    if (aRecord.status === "pending_payment") {
      await db.update(auctionSchedulesTable).set({ status: "cancelled" }).where(eq(auctionSchedulesTable.id, auctionId));
    }

    await interaction.editReply({ content: "🔒 جاري إلغاء الحجز..." });
    const ch = interaction.channel as TextChannel;
    setTimeout(() => ch.delete("Auction ticket cancelled").catch(() => {}), 3000);
    return;
  }

  // ── زرار معلومات روم (roominfo_*) ───────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("roominfo_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roomId = parseInt(interaction.customId.replace("roominfo_", ""), 10);
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));

    if (!room) {
      await interaction.editReply({ content: "❌ الروم مش موجود." });
      return;
    }

    const guildIconURL = interaction.guild?.iconURL({ extension: "png", size: 256 }) ?? undefined;
    const label        = roomLabel(room.name);
    const transferAmt  = calcTransferAmount(Number(room.price));
    const roleId       = ROOM_ROLE_IDS[room.name]; // قد يكون undefined لو الروم جديد

    const embed = new EmbedBuilder()
      .setAuthor({ name: "Dragon $hop", iconURL: guildIconURL })
      .setTitle(`丰丰 معلومات النوع 丰丰 ${label}`)
      .setColor(0x00bfff)
      .addFields(
        {
          name:  "‎",
          value:
            `丰 ▪ اسم النوع : ${label}\n` +
            `丰 ▪ شكل الرتبة : ${room.decorations || ""}${roleId ? ` <@&${roleId}>` : ""}\n` +
            `ـﮩ══════════════ﮩـ`,
          inline: false,
        },
        {
          name:  "منشنات النوع :",
          value:
            `◈ − @everyone : ${room.everyoneCount}\n` +
            `◈ − @here : ${room.hereCount}\n` +
            `◈ − <@&${OFFERS_ROLE_ID}> : ${room.offersCount}\n` +
            `ـﮩ══════════════ﮩـ`,
          inline: false,
        },
        {
          name:  "🎰 السعر :",
          value:
            `丰 ▪ السعر بكريدت : ${Math.round(Number(room.price))}\n` +
            `💸 مبلغ التحويل مع عمولة ProBot : ${transferAmt}`,
          inline: false,
        },
      )
      .setFooter({ text: "Dev By : mostafa9321 & ahmed_.p" });

    // أضف صورة التنين لو موجودة
    const files: AttachmentBuilder[] = [];
    if (fs.existsSync(DRAGON_IMAGE_PATH)) {
      files.push(new AttachmentBuilder(DRAGON_IMAGE_PATH, { name: "dragon.webp" }));
      embed.setThumbnail("attachment://dragon.webp");
    }

    const buyBtn = new ButtonBuilder()
      .setCustomId(`buy_${room.id}`)
      .setLabel(`🛒 شراء ${label}`)
      .setStyle(ButtonStyle.Primary);

    await interaction.editReply({
      embeds:     [embed],
      files,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(buyBtn)],
    });
    return;
  }

  // ── زرار شراء (buy_*) ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("buy_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const roomId = parseInt(interaction.customId.replace("buy_", ""), 10);
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
    if (!room) { await interaction.editReply({ content: "❌ الروم مش موجود." }); return; }

    const userId   = interaction.user.id;
    const username = interaction.user.username;

    if (await isUserBanned(userId)) {
      await interaction.editReply({ content: "❌ أنت محظور حالياً ولا تستطيع الشراء." });
      return;
    }

    const guild       = interaction.guild!;
    const transferAmt = calcTransferAmount(Number(room.price));

    // إنشاء شانل التذكرة
    // NOTE: التذكرة بتتعمل تحت كاتيجوري TICKETS_CATEGORY_ID.
    //       الـ everyone مش يشوفها — بس العميل والبوت.
    const ticketChannel = await guild.channels.create({
      name:   `ticket-${username}-${room.name}`,
      type:   ChannelType.GuildText,
      parent: TICKETS_CATEGORY_ID,
      permissionOverwrites: [
        { id: guild.id,              deny:  [PermissionFlagsBits.ViewChannel] },
        { id: userId,                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: guild.roles.everyone,  deny:  [PermissionFlagsBits.ViewChannel] },
      ],
    });

    // أضف الشراء في DB بستاتوس pending
    const [purchase] = await db
      .insert(purchasesTable)
      .values({
        discordUserId:   userId,
        discordUsername: username,
        roomId:          room.id,
        roomName:        room.name,
        totalPrice:      String(transferAmt),
        status:          "pending",
        ticketChannelId: ticketChannel.id,
      })
      .returning();

    const transferCommand = `C <@${OWNER_ID}> ${transferAmt}`;
    await db
      .update(purchasesTable)
      .set({ transferCommand })
      .where(eq(purchasesTable.id, purchase.id));

    const closeBtn  = new ButtonBuilder()
      .setCustomId(`close_ticket_${purchase.id}`)
      .setLabel("🔒 إغلاق التذكرة")
      .setStyle(ButtonStyle.Danger);
    const getCmdBtn = new ButtonBuilder()
      .setCustomId(`get_transfer_cmd_${purchase.id}`)
      .setLabel("📋 أمر التحويل")
      .setStyle(ButtonStyle.Secondary);

    const ticketEmbed = new EmbedBuilder()
      .setTitle(`🎟️ تذكرة شراء — ${room.name}`)
      .setDescription(
        `مرحباً <@${userId}>! 👋\n\n` +
        `**الروم المطلوب:** ${room.name}\n` +
        `**السعر الصافي:** ${Math.round(Number(room.price))}\n` +
        `**مبلغ التحويل (مع عمولة ProBot 5%):** \`${transferAmt}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `📋 **أمر التحويل:**\n\`${transferCommand}\`\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `1️⃣ انسخ الأمر فوق وبعثه في سيرفر ProBot\n` +
        `2️⃣ بعد التحويل، البوت هيتأكد تلقائياً\n` +
        `3️⃣ بعدين اكتب اسم الروم اللي عايزه هنا`
      )
      .setColor(0xffd700);

    await ticketChannel.send({
      content:    `<@${userId}>`,
      embeds:     [ticketEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(getCmdBtn, closeBtn)],
    });

    await interaction.editReply({ content: `✅ تم إنشاء تذكرتك! اضغط هنا: <#${ticketChannel.id}>` });
    return;
  }

  // ── زرار أمر التحويل (get_transfer_cmd_*) ────────────────────────────────
  // NOTE: بيبعت الأمر مرتين — مرة كنص عادي ومرة كـ code block.
  //       ده عشان سهولة النسخ على كل الأجهزة.
  if (interaction.isButton() && interaction.customId.startsWith("get_transfer_cmd_")) {
    const purchaseId = parseInt(interaction.customId.replace("get_transfer_cmd_", ""), 10);
    const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, purchaseId));
    if (!purchase) {
      await interaction.reply({ content: "❌ الشراء مش موجود.", flags: MessageFlags.Ephemeral });
      return;
    }
    const amount   = purchase.transferCommand?.split(" ").pop() ?? Math.round(Number(purchase.totalPrice));
    const plainCmd = `C <@${OWNER_ID}> ${amount}`;
    await interaction.reply({ content: plainCmd, flags: MessageFlags.Ephemeral });
    await interaction.followUp({ content: `\`${plainCmd}\``, flags: MessageFlags.Ephemeral });
    return;
  }

  // ── زرار إغلاق التذكرة (close_ticket_*) ─────────────────────────────────
  // NOTE: الشانل بيتحذف بعد 3 ثواني من الضغط.
  //       لو الشراء لسه pending يبقى cancelled في DB.
  if (interaction.isButton() && interaction.customId.startsWith("close_ticket_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const purchaseId = parseInt(interaction.customId.replace("close_ticket_", ""), 10);
    const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, purchaseId));
    if (!purchase) { await interaction.editReply({ content: "❌ التذكرة مش موجودة." }); return; }

    if (purchase.status === "pending") {
      await db
        .update(purchasesTable)
        .set({ status: "cancelled" })
        .where(eq(purchasesTable.id, purchaseId));
    }

    const ch = interaction.channel as TextChannel;
    await interaction.editReply({ content: "🔒 جاري إغلاق التذكرة..." });
    setTimeout(() => ch.delete("Ticket closed manually").catch(() => {}), 3000);
    return;
  }

  // ── زرار تأكيد تحويل الملكية (confirm_transfer_*) ────────────────────────
  // NOTE: بس الأونر يقدر يضغطه.
  //       الـ customId بيكون: confirm_transfer_{purchaseId}_{newOwnerId}
  if (interaction.isButton() && interaction.customId.startsWith("confirm_transfer_")) {
    if (interaction.user.id !== OWNER_ID) {
      await interaction.reply({ content: "❌ بس الأونر يقدر يؤكد التحويل.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const parts      = interaction.customId.replace("confirm_transfer_", "").split("_");
    const purchaseId = parseInt(parts[0], 10);
    const newOwnerId = parts[1];

    const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, purchaseId));
    if (!purchase) { await interaction.editReply({ content: "❌ الشراء مش موجود." }); return; }

    // حدّث الـ owner في DB
    await db
      .update(purchasesTable)
      .set({ discordUserId: newOwnerId })
      .where(eq(purchasesTable.id, purchaseId));

    // حدّث permissions الشانل في Discord
    if (purchase.discordRoomId) {
      const roomChannel = interaction.guild!.channels.cache.get(purchase.discordRoomId) as TextChannel | undefined;
      if (roomChannel) {
        await roomChannel.permissionOverwrites
          .create(newOwnerId, { ViewChannel: true, SendMessages: true, MentionEveryone: true })
          .catch(() => {});
        await roomChannel.permissionOverwrites
          .delete(purchase.discordUserId)
          .catch(() => {});
        await roomChannel.send(
          `✅ تم تحويل ملكية الروم من <@${purchase.discordUserId}> لـ <@${newOwnerId}>.`
        );
      }
    }

    await interaction.editReply({ content: `✅ تم تحويل الملكية بنجاح.` });
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SLASH COMMANDS
  // ══════════════════════════════════════════════════════════════════════════
  if (!interaction.isChatInputCommand()) return;

  // ── /shop ─────────────────────────────────────────────────────────────────
  if (interaction.commandName === "shop") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await sendShopPanel(interaction.channel as TextChannel);
    await interaction.editReply({ content: "✅ تم فتح بانل المتجر!" });
  }

  // ── /myroom ───────────────────────────────────────────────────────────────
  if (interaction.commandName === "myroom") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const purchases = await db
      .select()
      .from(purchasesTable)
      .where(
        and(
          eq(purchasesTable.discordUserId, interaction.user.id),
          eq(purchasesTable.status, "completed")
        )
      );
    if (purchases.length === 0) {
      await interaction.editReply({ content: "❌ مش عندك أي روم حالياً." });
      return;
    }
    const list = purchases
      .map((p) =>
        `• ${p.customRoomName ?? p.roomName}${p.discordRoomId ? ` (<#${p.discordRoomId}>)` : ""}`
      )
      .join("\n");
    await interaction.editReply({ content: `**الرومات بتاعتك:**\n${list}` });
  }

  // ── /addroom ──────────────────────────────────────────────────────────────
  // NOTE: بيضيف روم جديد للـ DB — مش بيعدل STATIC_ROOMS في الكود.
  //       الرومات المضافة هنا مش بتتـ override من syncStaticRooms لأنها بتعمل match بالاسم + الكاتيجوري.
  if (interaction.commandName === "addroom") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const name          = interaction.options.getString("name", true);
    const category      = interaction.options.getString("category", true);
    const price         = interaction.options.getNumber("price", true);
    const decorations   = interaction.options.getString("decorations") ?? "";
    const categoryId    = interaction.options.getString("category_id") ?? null;
    const offersCount   = interaction.options.getInteger("offers") ?? 0;
    const hereCount     = interaction.options.getInteger("here") ?? 0;
    const everyoneCount = interaction.options.getInteger("everyone") ?? 0;

    const [newRoom] = await db
      .insert(roomsTable)
      .values({
        name, category,
        price: String(price),
        decorations,
        discordCategoryId: categoryId,
        offersCount, hereCount, everyoneCount,
      })
      .returning();

    await interaction.editReply({
      content:
        `✅ **تم إضافة الروم بنجاح!**\n\n` +
        `🆔 ID: \`${newRoom.id}\`\n📛 الاسم: ${name}\n📂 الكاتيجوري: ${category}\n` +
        `💰 السعر الصافي: ${Math.round(price)}\n💸 مبلغ التحويل: ${calcTransferAmount(price)}\n` +
        `🎨 الزخارف: ${decorations || "لا يوجد"}\n` +
        `📢 @offers: ${offersCount} | 📣 @here: ${hereCount} | 🔊 @everyone: ${everyoneCount}`,
    });
  }

  // ── /listrooms ────────────────────────────────────────────────────────────
  if (interaction.commandName === "listrooms") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const rooms = await db.select().from(roomsTable).orderBy(roomsTable.category);
    if (rooms.length === 0) {
      await interaction.editReply({ content: "📭 مفيش رومات. استخدم `/addroom`." });
      return;
    }
    const lines = rooms.map((r) =>
      `**#${r.id}** — ${r.name} (${r.category})\n` +
      `   💰 سعر صافي: ${Math.round(Number(r.price))} | تحويل: ${calcTransferAmount(Number(r.price))}\n` +
      `   🎨 ${r.decorations || "بدون زخارف"} | 📂 Cat ID: ${r.discordCategoryId ?? "—"}\n` +
      `   📢 ${r.offersCount} offers | 📣 ${r.hereCount} here | 🔊 ${r.everyoneCount} everyone`
    );
    await interaction.editReply({ content: `**📋 قائمة الرومات:**\n\n${lines.join("\n\n")}` });
  }

  // ── /synccategories ───────────────────────────────────────────────────────
  if (interaction.commandName === "synccategories") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (
      interaction.user.id !== OWNER_ID &&
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const rooms = await db.select().from(roomsTable).where(eq(roomsTable.category, "المتاجر"));
    const lines = ROOM_CATEGORY_ORDER.map((name) => {
      const r = rooms.find((x) => x.name === name);
      if (!r) return `◻️ **${name}** → ❌ مش في الـ DB`;
      const status = r.discordCategoryId
        ? `✅ \`${r.discordCategoryId}\``
        : `❌ مش مربوط — استخدم \`/setcategoryid\``;
      return `${r.decorations || "◻️"} **${name}** (ID: ${r.id}) → ${status}`;
    });
    await interaction.editReply({
      content:
        `📋 **حالة ربط الرومات:**\n\n${lines.join("\n")}\n\n` +
        `💡 استخدم \`/setcategoryid\` لربط أي روم.`,
    });
  }

  // ── /setcategoryid ────────────────────────────────────────────────────────
  if (interaction.commandName === "setcategoryid") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const roomId = interaction.options.getInteger("room_id", true);
    const catId  = interaction.options.getString("category_id", true).trim();
    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, roomId));
    if (!room) {
      await interaction.editReply({ content: `❌ مفيش روم بالـ ID ده (${roomId}).` });
      return;
    }
    await db.update(roomsTable).set({ discordCategoryId: catId }).where(eq(roomsTable.id, roomId));
    await interaction.editReply({
      content:
        `✅ **تم الربط بنجاح!**\n\n` +
        `📦 الروم: **${room.name}** (ID: ${roomId})\n` +
        `📂 الكاتيجوري: \`${catId}\``,
    });
  }

  // ── /deleteroom ───────────────────────────────────────────────────────────
  // NOTE: بيحذف الروم من DB بس — مش بيحذف الشانلات على Discord.
  if (interaction.commandName === "deleteroom") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const roomId    = interaction.options.getInteger("id", true);
    const [deleted] = await db.delete(roomsTable).where(eq(roomsTable.id, roomId)).returning();
    if (!deleted) {
      await interaction.editReply({ content: `❌ مفيش روم بالـ ID ده (${roomId}).` });
      return;
    }
    await interaction.editReply({ content: `✅ تم حذف الروم **${deleted.name}** (ID: ${roomId}).` });
  }

  // ── /givebalance ──────────────────────────────────────────────────────────
  // NOTE: بيضيف رصيد منشنات ليوزر معين ويديله رول mention-bypass تلقائياً.
  if (interaction.commandName === "givebalance") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const targetUser  = interaction.options.getUser("user", true);
    const mentionType = interaction.options.getString("type", true) as "offers" | "here" | "everyone";
    const amount      = interaction.options.getInteger("amount", true);
    const user        = await getOrCreateUser(targetUser.id, targetUser.username);
    const balKey      = `${mentionType}Balance` as "offersBalance" | "hereBalance" | "everyoneBalance";
    const newBalance  = user[balKey] + amount;

    await db
      .update(botUsersTable)
      .set({ [balKey]: newBalance })
      .where(eq(botUsersTable.discordUserId, targetUser.id));

    const mentionName =
      mentionType === "offers"   ? `<@&${OFFERS_ROLE_ID}>` :
      mentionType === "here"     ? "@here"                 : "@everyone";

    // لو الرصيد أصبح موجود → دي رول "منشن مفعّل" عشان يقدر يمنشن
    if (newBalance > 0 && interaction.guild) {
      await grantMentionRole(interaction.guild, targetUser.id);
    }

    await interaction.editReply({
      content:
        `✅ تم إضافة **${amount}** منشن ${mentionName} لـ <@${targetUser.id}>\n` +
        `📊 رصيده الحالي: ${newBalance} منشن`,
    });
  }

  // ── /setaddonprice ────────────────────────────────────────────────────────
  // NOTE: بيعمل upsert في addon_prices table.
  //       لو الإضافة موجودة → يعدّل السعر والـ label.
  //       لو مش موجودة → يعمل row جديد.
  //       السعر بيتخزن كـ text (مش number) لتفادي مشاكل الدقة العشرية في DB.
  if (interaction.commandName === "setaddonprice") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.editReply({ content: "❌ محتاج صلاحية Administrator." });
      return;
    }
    const key   = interaction.options.getString("addon", true) as AddonKey;
    const price = interaction.options.getNumber("price", true);
    const addon = ADDONS.find((a) => a.key === key)!;

    if (!Number.isFinite(price) || price < 0) {
      await interaction.editReply({ content: "❌ السعر لازم يكون رقم صحيح موجب." });
      return;
    }

    const roundedPrice = Math.round(price);
    await db
      .insert(addonPricesTable)
      .values({ key, label: addon.label, price: String(roundedPrice) })
      .onConflictDoUpdate({
        target: addonPricesTable.key,
        set:    { label: addon.label, price: String(roundedPrice), updatedAt: new Date() },
      });

    await interaction.editReply({
      content:
        `✅ **تم تحديث السعر!**\n\n` +
        `📌 الإضافة: **${addon.label}**\n` +
        `💰 السعر الجديد: **${roundedPrice} كريدت**`,
    });
  }

  // ── /transferroom ─────────────────────────────────────────────────────────
  // NOTE: رسوم التحويل = 50% من سعر الروم الصافي.
  //       الزرار confirm_transfer بيظهر للأونر في نفس الشانل.
  //       الأونر لازم يتأكد إن العميل دفع الرسوم قبل ما يضغط تأكيد.
  if (interaction.commandName === "transferroom") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const targetUser  = interaction.options.getUser("user", true);
    const roomNameArg = interaction.options.getString("room", true);
    const userId      = interaction.user.id;

    const purchases = await db
      .select()
      .from(purchasesTable)
      .where(
        and(
          eq(purchasesTable.discordUserId, userId),
          eq(purchasesTable.status, "completed")
        )
      );

    const purchase = purchases.find((p) =>
      (p.customRoomName ?? p.roomName).toLowerCase().includes(roomNameArg.toLowerCase())
    );
    if (!purchase) {
      await interaction.editReply({ content: "❌ مش لاقي روم بالاسم ده عندك." });
      return;
    }

    const [room] = await db.select().from(roomsTable).where(eq(roomsTable.id, purchase.roomId));
    if (!room) { await interaction.editReply({ content: "❌ الروم مش موجود." }); return; }

    const transferFee = Number(room.price) * 0.5;

    const embed = new EmbedBuilder()
      .setTitle("🔄 تحويل ملكية روم")
      .setDescription(
        `<@${userId}> عايز يحول ملكية الروم **${purchase.customRoomName ?? purchase.roomName}** ` +
        `لـ <@${targetUser.id}>\n\n` +
        `**رسوم التحويل:** ${Math.round(transferFee)} (نص ثمن الروم الصافي)\n\n` +
        `⚠️ لازم تدفع رسوم التحويل للأونر عشان يتم التحويل.`
      )
      .setColor(0xffa500);

    const confirmBtn = new ButtonBuilder()
      .setCustomId(`confirm_transfer_${purchase.id}_${targetUser.id}`)
      .setLabel("✅ تأكيد الدفع وإتمام التحويل")
      .setStyle(ButtonStyle.Success);

    await (interaction.channel as TextChannel).send({
      content:    `<@${OWNER_ID}>`,
      embeds:     [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn)],
    });

    await interaction.editReply({
      content: `✅ تم إرسال طلب تحويل الملكية. رسوم التحويل: ${Math.round(transferFee)}`,
    });
  }
  } catch (err) {
    logger.error({ err, interactionId: interaction.id }, "Unhandled error in InteractionCreate");
    // حاول تبلّغ المستخدم لو الـ interaction لسه ما اتردّش
    try {
      if (interaction.isRepliable()) {
        const replyMethod = interaction.deferred || interaction.replied
          ? interaction.editReply.bind(interaction)
          : interaction.reply.bind(interaction);
        await replyMethod({ content: "❌ حصل خطأ غير متوقع. حاول تاني أو تواصل مع الأدمن." });
      }
    } catch { /* تجاهل أخطاء الـ fallback reply */ }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  startBot — نقطة الدخول
//  NOTE: بيتنادى من index.ts عند بدء الـ server.
//        المتغيرات المطلوبة بتتتحقق منها عند import البوت — لو مش موجودة بيرمي error.
// ══════════════════════════════════════════════════════════════════════════════
export function startBot(): void {
  client.login(TOKEN).catch((err) => {
    logger.error({ err }, "Failed to login to Discord — exiting");
    process.exit(1);
  });
}
