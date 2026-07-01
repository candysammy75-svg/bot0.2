import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Rooms ───────────────────────────────────────────────────────────────────
export const roomsTable = pgTable("rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: text("price").notNull().default("0"),
  decorations: text("decorations").notNull().default(""),
  offersCount: integer("offers_count").notNull().default(0),
  hereCount: integer("here_count").notNull().default(0),
  everyoneCount: integer("everyone_count").notNull().default(0),
  discordCategoryId: text("discord_category_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRoomSchema = createInsertSchema(roomsTable).omit({ id: true, createdAt: true });
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof roomsTable.$inferSelect;

// ─── Purchases ───────────────────────────────────────────────────────────────
export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  discordUserId: text("discord_user_id").notNull(),
  discordUsername: text("discord_username").notNull(),
  roomId: integer("room_id").notNull(),
  roomName: text("room_name").notNull(),
  customRoomName: text("custom_room_name"),
  totalPrice: text("total_price").notNull().default("0"),
  transferCommand: text("transfer_command"),
  status: text("status").notNull().default("pending"),
  ticketChannelId: text("ticket_channel_id"),
  discordRoomId: text("discord_room_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;

// ─── Bot Users ────────────────────────────────────────────────────────────────
export const botUsersTable = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  discordUserId: text("discord_user_id").notNull().unique(),
  discordUsername: text("discord_username").notNull(),
  offersBalance: integer("offers_balance").notNull().default(0),
  hereBalance: integer("here_balance").notNull().default(0),
  everyoneBalance: integer("everyone_balance").notNull().default(0),
  isBanned: boolean("is_banned").notNull().default(false),
  bannedUntil: timestamp("banned_until"),
  warningCount: integer("warning_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBotUserSchema = createInsertSchema(botUsersTable).omit({ id: true, createdAt: true });
export type InsertBotUser = z.infer<typeof insertBotUserSchema>;
export type BotUser = typeof botUsersTable.$inferSelect;

// ─── Addon Prices ─────────────────────────────────────────────────────────────
export const addonPricesTable = pgTable("addon_prices", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  price: text("price").notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AddonPrice = typeof addonPricesTable.$inferSelect;

// ─── Warnings ─────────────────────────────────────────────────────────────────
export const warningsTable = pgTable("warnings", {
  id: serial("id").primaryKey(),
  discordUserId: text("discord_user_id").notNull(),
  discordUsername: text("discord_username").notNull(),
  reason: text("reason").notNull(),
  messageContent: text("message_content"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWarningSchema = createInsertSchema(warningsTable).omit({ id: true, createdAt: true });
export type InsertWarning = z.infer<typeof insertWarningSchema>;
export type Warning = typeof warningsTable.$inferSelect;
