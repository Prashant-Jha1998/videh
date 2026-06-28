/** Code samples for Videh Business API integration docs. */

export type ApiLang = "curl" | "javascript" | "python" | "php" | "deno";

export const API_LANG_LABELS: Record<ApiLang, string> = {
  curl: "cURL",
  javascript: "JavaScript (Node.js)",
  python: "Python",
  php: "PHP",
  deno: "Deno / Supabase Edge",
};

export type SnippetCtx = {
  baseUrl?: string;
  keyId?: string;
  secret?: string;
  phoneNumberId?: string;
};

const BASE = "https://developer.videh.co.in";
const KEY = "vsk_YOUR_KEY_ID";
const SECRET = "vsec_YOUR_SECRET";
const PHONE_ID = "YOUR_PHONE_NUMBER_ID";

function ctxOrDefaults(ctx: SnippetCtx) {
  return {
    baseUrl: ctx.baseUrl ?? BASE,
    keyId: ctx.keyId ?? KEY,
    secret: ctx.secret ?? SECRET,
    phoneNumberId: ctx.phoneNumberId ?? PHONE_ID,
    auth: `Bearer ${ctx.keyId ?? KEY}:${ctx.secret ?? SECRET}`,
  };
}

export function envSnippet(ctx: SnippetCtx = {}): string {
  const c = ctxOrDefaults(ctx);
  return `# Server-side only — never expose in browser / mobile app
VIDEH_API_BASE_URL=${c.baseUrl}
VIDEH_API_KEY_ID=${c.keyId}
VIDEH_API_SECRET=${c.secret}
VIDEH_PHONE_NUMBER_ID=${c.phoneNumberId}`;
}

export function meSnippet(lang: ApiLang, ctx: SnippetCtx = {}): string {
  const c = ctxOrDefaults(ctx);
  switch (lang) {
    case "curl":
      return `curl "${c.baseUrl}/v1/me" \\
  -H "Authorization: ${c.auth}"`;
    case "javascript":
      return `const res = await fetch("${c.baseUrl}/v1/me", {
  headers: { Authorization: "${c.auth}" },
});
const data = await res.json();
console.log(data);`;
    case "python":
      return `import requests

r = requests.get(
    "${c.baseUrl}/v1/me",
    headers={"Authorization": "${c.auth}"},
)
print(r.json())`;
    case "php":
      return `<?php
$ch = curl_init("${c.baseUrl}/v1/me");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: ${c.auth}"],
]);
echo curl_exec($ch);`;
    case "deno":
      return `const res = await fetch(\`\${Deno.env.get("VIDEH_API_BASE_URL")}/v1/me\`, {
  headers: {
    Authorization: \`Bearer \${Deno.env.get("VIDEH_API_KEY_ID")}:\${Deno.env.get("VIDEH_API_SECRET")}\`,
  },
});
const data = await res.json();`;
  }
}

export function templatesSnippet(lang: ApiLang, ctx: SnippetCtx = {}): string {
  const c = ctxOrDefaults(ctx);
  switch (lang) {
    case "curl":
      return `curl "${c.baseUrl}/v1/templates" \\
  -H "Authorization: ${c.auth}"`;
    case "javascript":
      return `const res = await fetch("${c.baseUrl}/v1/templates", {
  headers: { Authorization: "${c.auth}" },
});
const { data: templates } = await res.json();
// Use templates[].name — must be status "approved"`;
    case "python":
      return `import requests

r = requests.get(
    "${c.baseUrl}/v1/templates",
    headers={"Authorization": "${c.auth}"},
)
templates = r.json()["data"]`;
    case "php":
      return `<?php
$ch = curl_init("${c.baseUrl}/v1/templates");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: ${c.auth}"],
]);
$templates = json_decode(curl_exec($ch), true)["data"];`;
    case "deno":
      return `const res = await fetch(\`\${Deno.env.get("VIDEH_API_BASE_URL")}/v1/templates\`, {
  headers: {
    Authorization: \`Bearer \${Deno.env.get("VIDEH_API_KEY_ID")}:\${Deno.env.get("VIDEH_API_SECRET")}\`,
  },
});
const { data: templates } = await res.json();`;
  }
}

export function sendMessageSnippet(lang: ApiLang, ctx: SnippetCtx = {}): string {
  const c = ctxOrDefaults(ctx);
  const bodyJson = `{
  "to": "919876543210",
  "template": {
    "name": "order_update",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Prashant" },
          { "type": "text", "text": "ORD-88421" }
        ]
      }
    ]
  }
}`;

  switch (lang) {
    case "curl":
      return `curl -X POST "${c.baseUrl}/v1/${c.phoneNumberId}/messages" \\
  -H "Authorization: ${c.auth}" \\
  -H "Content-Type: application/json" \\
  -d '${bodyJson}'`;
    case "javascript":
      return `// Node.js 18+ — run on your server, not in the browser
const res = await fetch(
  \`\${process.env.VIDEH_API_BASE_URL}/v1/\${process.env.VIDEH_PHONE_NUMBER_ID}/messages\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.VIDEH_API_KEY_ID}:\${process.env.VIDEH_API_SECRET}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "919876543210", // 91 + 10-digit Indian mobile
      template: {
        name: "order_update", // approved template name from GET /v1/templates
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Prashant" },
              { type: "text", text: "ORD-88421" },
            ],
          },
        ],
      },
    }),
  },
);
const data = await res.json();
if (!data.success) throw new Error(JSON.stringify(data.error));`;
    case "python":
      return `import os, requests

payload = {
    "to": "919876543210",
    "template": {
        "name": "order_update",
        "language": {"code": "en"},
        "components": [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": "Prashant"},
                    {"type": "text", "text": "ORD-88421"},
                ],
            }
        ],
    },
}

r = requests.post(
    f"{os.environ['VIDEH_API_BASE_URL']}/v1/{os.environ['VIDEH_PHONE_NUMBER_ID']}/messages",
    headers={
        "Authorization": f"Bearer {os.environ['VIDEH_API_KEY_ID']}:{os.environ['VIDEH_API_SECRET']}",
        "Content-Type": "application/json",
    },
    json=payload,
)
print(r.json())`;
    case "php":
      return `<?php
$base = getenv('VIDEH_API_BASE_URL');
$phoneId = getenv('VIDEH_PHONE_NUMBER_ID');
$key = getenv('VIDEH_API_KEY_ID');
$secret = getenv('VIDEH_API_SECRET');

$payload = [
  'to' => '919876543210',
  'template' => [
    'name' => 'order_update',
    'language' => ['code' => 'en'],
    'components' => [[
      'type' => 'body',
      'parameters' => [
        ['type' => 'text', 'text' => 'Prashant'],
        ['type' => 'text', 'text' => 'ORD-88421'],
      ],
    ]],
  ],
];

$ch = curl_init("$base/v1/$phoneId/messages");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer $key:$secret",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode($payload),
]);
echo curl_exec($ch);`;
    case "deno":
      return `import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const base = Deno.env.get("VIDEH_API_BASE_URL") ?? "https://developer.videh.co.in";
  const keyId = Deno.env.get("VIDEH_API_KEY_ID")!;
  const secret = Deno.env.get("VIDEH_API_SECRET")!;
  const phoneId = Deno.env.get("VIDEH_PHONE_NUMBER_ID")!;

  const { to, name } = await req.json();
  let phone = String(to).replace(/\\D/g, "");
  if (phone.length === 10) phone = \`91\${phone}\`;

  const res = await fetch(\`\${base}/v1/\${phoneId}/messages\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${keyId}:\${secret}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: phone,
      template: {
        name: "birth_day",
        language: { code: "en" },
        components: name
          ? [{ type: "body", parameters: [{ type: "text", text: String(name) }] }]
          : undefined,
      },
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});`;
  }
}
