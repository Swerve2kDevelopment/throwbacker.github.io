import { getGameNews, serializeGameNews } from "@/lib/game-news";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const articles = await getGameNews();
  return new Response(serializeGameNews(articles, new URL(request.url).origin), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600"
    }
  });
}
