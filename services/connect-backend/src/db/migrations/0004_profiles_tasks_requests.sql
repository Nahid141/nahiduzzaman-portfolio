CREATE TYPE "public"."meeting_request_kind" AS ENUM('meeting', 'coffee');--> statement-breakpoint
CREATE TYPE "public"."meeting_request_status" AS ENUM('pending', 'approved', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_visibility" AS ENUM('public', 'admin');--> statement-breakpoint
CREATE TABLE "meeting_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"kind" "meeting_request_kind" DEFAULT 'meeting' NOT NULL,
	"topic" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"starts_at" timestamp (3) with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"status" "meeting_request_status" DEFAULT 'pending' NOT NULL,
	"decision_note" text DEFAULT '' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"visibility" "task_visibility" DEFAULT 'public' NOT NULL,
	"highlight" boolean DEFAULT false NOT NULL,
	"due_at" timestamp (3) with time zone,
	"done_at" timestamp (3) with time zone,
	"done_by" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"meeting_request_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_avatars" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ALTER COLUMN "max_participants" SET DEFAULT 15;--> statement-breakpoint
ALTER TABLE "music_requests" ALTER COLUMN "file_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "music_requests" ADD COLUMN "youtube_id" text;--> statement-breakpoint
ALTER TABLE "music_requests" ADD COLUMN "title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_emoji" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_text" text;--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_requests_status_idx" ON "meeting_requests" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "meeting_requests_user_idx" ON "meeting_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "tasks_visibility_idx" ON "tasks" USING btree ("visibility","done_at");--> statement-breakpoint
CREATE INDEX "tasks_created_by_idx" ON "tasks" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "music_requests" ADD CONSTRAINT "music_requests_one_source" CHECK (("file_id" IS NOT NULL)::int + ("youtube_id" IS NOT NULL)::int = 1);--> statement-breakpoint
ALTER TABLE "music_requests" ADD CONSTRAINT "music_requests_youtube_id_format" CHECK ("youtube_id" IS NULL OR "youtube_id" ~ '^[A-Za-z0-9_-]{11}$');--> statement-breakpoint
ALTER TABLE "meetings" DROP CONSTRAINT "meetings_max_participants_range";--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_max_participants_range" CHECK ("max_participants" BETWEEN 2 AND 15);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_title_length" CHECK (char_length("title") BETWEEN 1 AND 300);--> statement-breakpoint
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_duration_range" CHECK ("duration_min" BETWEEN 15 AND 240);--> statement-breakpoint
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_size" CHECK (octet_length("data") <= 204800);--> statement-breakpoint
UPDATE "app_settings" SET "value" = '15'::jsonb WHERE "key" = 'maxMeetingParticipants' AND "value" = '10'::jsonb;--> statement-breakpoint
DO $$
DECLARE
  t record;
  api_role text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
