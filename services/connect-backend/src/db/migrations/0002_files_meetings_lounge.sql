CREATE TYPE "public"."file_kind" AS ENUM('image', 'document', 'audio', 'video', 'archive');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."music_request_status" AS ENUM('pending', 'queued', 'rejected', 'played', 'removed');--> statement-breakpoint
CREATE TYPE "public"."participant_state" AS ENUM('invited', 'waiting', 'admitted', 'denied', 'removed');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dj_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"channel_id" uuid,
	"conversation_id" uuid,
	"object_path" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"kind" "file_kind" NOT NULL,
	"folder" text DEFAULT '' NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"scan" text DEFAULT 'not_scanned' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"meeting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" "participant_state" NOT NULL,
	"can_screen_share" boolean DEFAULT false NOT NULL,
	"hand_raised_at" timestamp with time zone,
	"share_requested_at" timestamp with time zone,
	"reserved_until" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_participants_meeting_id_user_id_pk" PRIMARY KEY("meeting_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid,
	"host_id" uuid,
	"room" text NOT NULL,
	"audio_only" boolean DEFAULT false NOT NULL,
	"invite_only" boolean DEFAULT false NOT NULL,
	"waiting_room" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"screen_share" text DEFAULT 'all' NOT NULL,
	"max_participants" integer DEFAULT 10 NOT NULL,
	"status" "meeting_status" DEFAULT 'live' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"message_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "message_attachments_message_id_file_id_pk" PRIMARY KEY("message_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "music_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" "music_request_status" DEFAULT 'pending' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"decided_by" uuid,
	"position" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"poll_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_poll_id_user_id_option_pk" PRIMARY KEY("poll_id","user_id","option")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid,
	"conversation_id" uuid,
	"created_by" uuid,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"multiple" boolean DEFAULT false NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"closes_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_state" (
	"key" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"key" text NOT NULL,
	"period" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_key_period_pk" PRIMARY KEY("key","period")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_grants" ADD CONSTRAINT "dj_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dj_grants" ADD CONSTRAINT "dj_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_requests" ADD CONSTRAINT "music_requests_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_requests" ADD CONSTRAINT "music_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_requests" ADD CONSTRAINT "music_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_state" ADD CONSTRAINT "shared_state_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "announcements_created_idx" ON "announcements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dj_grants_user_idx" ON "dj_grants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "files_object_path_uq" ON "files" USING btree ("object_path");--> statement-breakpoint
CREATE INDEX "files_owner_idx" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "files_channel_created_idx" ON "files" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "files_conversation_created_idx" ON "files" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "files_status_created_idx" ON "files" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "meeting_participants_user_idx" ON "meeting_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_room_uq" ON "meetings" USING btree ("room");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "message_attachments_file_idx" ON "message_attachments" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "music_requests_status_idx" ON "music_requests" USING btree ("status","position");--> statement-breakpoint
CREATE INDEX "music_requests_file_idx" ON "music_requests" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "poll_votes_user_idx" ON "poll_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "polls_channel_idx" ON "polls" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "polls_conversation_idx" ON "polls" USING btree ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_one_target" CHECK (("channel_id" IS NULL) <> ("conversation_id" IS NULL));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_one_target" CHECK (("channel_id" IS NULL) <> ("conversation_id" IS NULL));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_size_positive" CHECK ("size_bytes" > 0);--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_max_participants_range" CHECK ("max_participants" BETWEEN 2 AND 10);--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_screen_share_policy" CHECK ("screen_share" IN ('host', 'all', 'approved'));--> statement-breakpoint
/*
  Supabase lockdown. The backend is the only client: it connects as the table owner over the
  Postgres pooler, and the table owner bypasses RLS. Enabling RLS with no policies and revoking
  every privilege from the Data API roles means nothing in "public" is reachable through
  PostgREST/GraphQL even if the Data API is switched on. On plain Postgres (tests, self-hosting)
  the Supabase roles do not exist and only RLS is enabled.
*/
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
