import { watch } from "fs";

const PUBLIC_DIR = "./public";
const PORT = 4680;

const clients: Set<ReadableStreamDefaultController> = new Set();

function sendReload() {
  for (const controller of clients) {
    try {
      controller.enqueue("data: reload\n\n");
    } catch {
      clients.delete(controller);
    }
  }
}

// Debounced reload to avoid rapid-fire events
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(sendReload, 100);
}

// Watch for file changes and trigger reload
watch("./public", { recursive: true }, debouncedReload);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // SSE endpoint for hot reload
    if (url.pathname === "/__reload") {
      const stream = new ReadableStream({
        start(controller) {
          clients.add(controller);
          controller.enqueue("data: connected\n\n");
        },
        cancel(controller) {
          clients.delete(controller);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Serve static files
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(PUBLIC_DIR + path);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Screensaver running at http://localhost:${PORT}`);
