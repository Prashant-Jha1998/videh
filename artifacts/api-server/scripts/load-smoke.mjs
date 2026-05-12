const baseUrl = (process.env.API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const authToken = process.env.API_AUTH_TOKEN || "";
const userId = process.env.API_USER_ID || "";
const chatId = process.env.API_CHAT_ID || "";
const callId = process.env.API_CALL_ID || "";
const includePush = process.env.LOAD_PUSH === "1";
const concurrency = Number(process.env.LOAD_CONCURRENCY || 10);
const requests = Number(process.env.LOAD_REQUESTS || 100);

function headers(json = false) {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

async function timed(name, fn) {
  const start = performance.now();
  const res = await fn();
  const ms = performance.now() - start;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${name} failed: ${res.status} ${text.slice(0, 160)}`);
  }
  return ms;
}

async function runMany(name, fn) {
  const latencies = [];
  let next = 0;
  async function worker() {
    while (next < requests) {
      next += 1;
      latencies.push(await timed(name, fn));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length);
  console.log(`${name}: ${latencies.length} requests, avg=${avg.toFixed(1)}ms, p95=${p95.toFixed(1)}ms`);
}

await timed("healthz", () => fetch(`${baseUrl}/healthz`));
await timed("readyz", () => fetch(`${baseUrl}/readyz`));
console.log(`Readiness checks passed for ${baseUrl}`);

if (userId) {
  await runMany("chat-list", () => fetch(`${baseUrl}/api/chats/user/${userId}`, { headers: headers() }));
  await runMany("statuses", () => fetch(`${baseUrl}/api/statuses/user/${userId}`, { headers: headers() }));
  await runMany("incoming-calls", () => fetch(`${baseUrl}/api/webrtc/calls/incoming/${userId}`, { headers: headers() }));
}

if (chatId && userId) {
  await runMany("messages", () => fetch(`${baseUrl}/api/chats/${chatId}/messages?limit=50&userId=${userId}`, { headers: headers() }));
}

if (authToken) {
  await runMany("media-upload", () => {
    const form = new FormData();
    form.append("file", new Blob(["videh-load-smoke"], { type: "text/plain" }), "load-smoke.txt");
    return fetch(`${baseUrl}/api/chats/media`, { method: "POST", headers: headers(), body: form });
  });
}

if (callId) {
  await runMany("call-status", () => fetch(`${baseUrl}/api/webrtc/calls/${callId}/status?userId=${userId}`, { headers: headers() }));
}

if (includePush && userId) {
  await timed("push-config", () => fetch(`${baseUrl}/api/users/${userId}/test-push`, { method: "POST", headers: headers() }));
}

console.log("Load smoke test complete.");
