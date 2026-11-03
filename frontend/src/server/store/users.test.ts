import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/client", () => import("@/test/db"));

import { resetDb } from "@/test/db";
import { createUser, toPublicUser } from "./users";

beforeEach(resetDb);

describe("toPublicUser", () => {
  it("không bao giờ trả passwordHash ra ngoài", async () => {
    const user = await createUser({
      firstName: "Lan",
      lastName: "Nguyễn",
      email: "ketoan@anser.dev",
      passwordHash: "$2a$10$hash",
    });

    const publicUser = toPublicUser(user);

    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(publicUser)).not.toContain("$2a$10$hash");
    expect(publicUser).toMatchObject({ id: user.id, email: "ketoan@anser.dev" });
  });
});
