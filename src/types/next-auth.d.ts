import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      discordId?: string | null;
      username?: string | null;
      avatar?: string | null;
      role?: UserRole;
      isAdmin?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    discordId?: string | null;
    username?: string | null;
    avatar?: string | null;
    role?: UserRole;
  }
}
