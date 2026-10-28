CREATE TABLE "reports" (
	"id" serial PRIMARY KEY,
	"tracking_token" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"category" text DEFAULT 'Other' NOT NULL,
	"location" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'Received' NOT NULL,
	"priority" text DEFAULT 'Normal' NOT NULL,
	"assigned_to" text DEFAULT '' NOT NULL,
	"management_notes" text DEFAULT '' NOT NULL,
	"photo_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
