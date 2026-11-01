ALTER TABLE "customers" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "opening_debt" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_reduced_vat" boolean;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "opening_debt" numeric(18, 2);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_unique" ON "customers" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_unique" ON "suppliers" USING btree (lower("code"));