-- Bỏ cấp "manager" khỏi phân quyền (kế hoạch mới: chỉ 2 cấp staff/admin). "manager" chưa từng
-- được route nào kiểm tra riêng nên hạ cấp an toàn về "staff", không mất quyền truy cập nào.
UPDATE "users" SET "role" = 'staff' WHERE "role" = 'manager';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_hop_le";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_hop_le" CHECK ("users"."role" IN ('staff','admin'));