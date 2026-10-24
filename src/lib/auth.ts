import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

import { cachePlayerAvatar } from "@/lib/avatar-cache";
import { prisma } from "@/lib/prisma";

type DiscordProfile = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  image?: string | null;
  image_url?: string | null;
  discriminator?: string | null;
  email?: string | null;
};

function discordAvatarUrl(profile: DiscordProfile) {
  if (profile.image_url?.startsWith("https://")) return profile.image_url;
  if (profile.image?.startsWith("https://")) return profile.image;
  if (profile.avatar?.startsWith("https://")) return profile.avatar;
  if (!profile.avatar) {
    const discriminator = Number(profile.discriminator ?? 0);
    const fallbackIndex = Number.isFinite(discriminator) ? discriminator % 5 : 0;
    return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
  }
  const extension = profile.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${extension}`;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "identify email"
        }
      },
      profile(profile) {
        const discordProfile = profile as DiscordProfile;
        const avatar = discordAvatarUrl(discordProfile);
        const displayName = discordProfile.global_name || discordProfile.username;

        return {
          id: discordProfile.id,
          name: displayName,
          email: discordProfile.email ?? null,
          image: avatar,
          discordId: discordProfile.id,
          username: discordProfile.username,
          avatar
        };
      }
    })
  ],
  callbacks: {
    async session({ session, user }) {
      if (!session.user) return session;

      const account = user.discordId
        ? null
        : await prisma.account.findFirst({
            where: {
              userId: user.id,
              provider: "discord"
            },
            select: { providerAccountId: true }
          });
      const discordId = user.discordId ?? account?.providerAccountId ?? null;
      const adminRecord = user.discordId
        ? await prisma.adminUser.findUnique({
            where: { discordId: user.discordId },
            select: { id: true }
          })
        : discordId
          ? await prisma.adminUser.findUnique({
              where: { discordId },
              select: { id: true }
            })
        : null;

      session.user.id = user.id;
      session.user.discordId = discordId;
      session.user.username = user.username ?? user.name ?? null;
      session.user.avatar = user.avatar ?? user.image ?? null;
      session.user.role = user.role;
      session.user.isAdmin = user.role === "ADMIN" || Boolean(adminRecord);

      return session;
    }
  },
  events: {
    async signIn({ user, profile }) {
      const discordProfile = profile as DiscordProfile | undefined;
      if (!discordProfile?.id || !user.id) return;

      const avatar = discordAvatarUrl(discordProfile);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          discordId: discordProfile.id,
          username: discordProfile.username,
          avatar,
          name: discordProfile.global_name || discordProfile.username,
          image: avatar
        }
      });

      // Logging in hands us a fresh avatar URL, which is the cheapest way to
      // repair a player profile whose stored Discord link has expired.
      try {
        const players = await prisma.player.findMany({ where: { discordId: discordProfile.id }, select: { id: true } });
        for (const player of players) {
          const avatarUrl = await cachePlayerAvatar(player.id, avatar);
          if (avatarUrl) await prisma.player.update({ where: { id: player.id }, data: { avatarUrl } });
        }
      } catch {
        // Avatar caching must never block sign-in.
      }
    }
  }
};
