import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const reports = pgTable("reports", {
  id: serial().primaryKey(),
  trackingToken: text("tracking_token").notNull().unique(),
  title: text().notNull(),
  category: text().notNull().default("Other"),
  location: text().notNull(),
  description: text().notNull(),
  status: text().notNull().default("Received"),
  priority: text().notNull().default("Normal"),
  assignedTo: text("assigned_to").notNull().default(""),
  managementNotes: text("management_notes").notNull().default(""),
  photoKey: text("photo_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
