CREATE TYPE "public"."game_status" AS ENUM('waiting', 'active', 'finished', 'abandoned');--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" "game_status" DEFAULT 'waiting' NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" jsonb,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_kind_format" CHECK ("kind" ~ '^[a-z0-9]{2,20}$');--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_players_count" CHECK (jsonb_typeof("players") = 'array' AND jsonb_array_length("players") <= 4);--> statement-breakpoint
ALTER TABLE "games" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON public.games FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
