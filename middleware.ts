/**
 * Vela — Edge Middleware: rate limit 100 req/IP/dia no /api/chat
 * Plano Vercel Hobby: Edge Middleware incluído
 * Storage in-memory (suficiente pré-PMF 10 pessoas, sem KV)
 * Decision 0089: não loga IPs em disco
 * Web Standards (Request/Response) · sem Next.js
 */

const store = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 100;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export const config = {
  matcher: ["/api/chat"],
};

export default function middleware(req: Request): Response {
  if (req.method !== "POST") {
    return new Response(null, { status: 200, headers: { "x-middleware-next": "1" } });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const now = Date.now();
  const record = store.get(ip);

  if (!record || now > record.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return new Response(null, { status: 200, headers: { "x-middleware-next": "1" } });
  }

  if (record.count >= LIMIT) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return new Response(
      JSON.stringify({ error: "Limite de mensagens atingido. Tente amanhã." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  record.count += 1;
  return new Response(null, { status: 200, headers: { "x-middleware-next": "1" } });
}
