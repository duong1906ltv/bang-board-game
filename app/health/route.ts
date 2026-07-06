// Health endpoint for Docker healthcheck and CI smoke test.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("OK", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}
