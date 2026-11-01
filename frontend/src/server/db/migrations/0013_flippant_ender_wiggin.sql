ALTER TABLE "categories" DROP CONSTRAINT "categories_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_case_insensitive_unique" ON "categories" USING btree (lower("name"));