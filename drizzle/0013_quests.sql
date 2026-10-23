CREATE SCHEMA "quests";
--> statement-breakpoint
CREATE TABLE "quests"."claims" (
	"player_id" text NOT NULL,
	"day" text NOT NULL,
	"quest_id" text NOT NULL,
	"transfer_id" text NOT NULL,
	"reward" jsonb NOT NULL,
	"status" text NOT NULL,
	"claimed_at" bigint NOT NULL,
	"paid_at" bigint,
	CONSTRAINT "claims_player_id_day_quest_id_pk" PRIMARY KEY("player_id","day","quest_id")
);
--> statement-breakpoint
CREATE TABLE "quests"."erased_players" (
	"player_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests"."notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests"."participants" (
	"game_id" text NOT NULL,
	"player_id" text NOT NULL,
	CONSTRAINT "participants_game_id_player_id_pk" PRIMARY KEY("game_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "quests"."progress" (
	"player_id" text NOT NULL,
	"day" text NOT NULL,
	"quest_id" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "progress_player_id_day_quest_id_pk" PRIMARY KEY("player_id","day","quest_id")
);
--> statement-breakpoint
CREATE TABLE "quests"."trades" (
	"offer_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"buyer_id" text
);
--> statement-breakpoint
CREATE TABLE "quests"."villages" (
	"player_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "claims_transfer_idx" ON "quests"."claims" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "notifications_player_id_idx" ON "quests"."notifications" USING btree ("player_id","id");--> statement-breakpoint
CREATE INDEX "participants_player_idx" ON "quests"."participants" USING btree ("player_id");