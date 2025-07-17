export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ name: 'Cloudflare' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return env.ASSETS.fetch(request)
  },
}
