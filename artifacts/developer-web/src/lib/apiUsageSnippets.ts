/** Code samples for Videh Business API integration docs. */

export type ApiLang =
  | "curl"
  | "javascript"
  | "python"
  | "java"
  | "kotlin"
  | "go"
  | "csharp"
  | "php"
  | "ruby"
  | "swift"
  | "dart"
  | "deno";

export const API_LANG_LABELS: Record<ApiLang, string> = {
  curl: "cURL",
  javascript: "JavaScript (Node.js)",
  python: "Python",
  java: "Java",
  kotlin: "Kotlin (Android / JVM)",
  go: "Go",
  csharp: "C# (.NET)",
  php: "PHP",
  ruby: "Ruby",
  swift: "Swift (iOS / macOS)",
  dart: "Dart (Flutter server)",
  deno: "Deno / Supabase Edge",
};

export const API_LANG_ORDER: ApiLang[] = [
  "curl",
  "javascript",
  "python",
  "java",
  "kotlin",
  "go",
  "csharp",
  "php",
  "ruby",
  "swift",
  "dart",
  "deno",
];

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
    case "java":
      return `import java.net.URI;
import java.net.http.*;

HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(System.getenv("VIDEH_API_BASE_URL") + "/v1/me"))
    .header("Authorization", "Bearer "
        + System.getenv("VIDEH_API_KEY_ID") + ":"
        + System.getenv("VIDEH_API_SECRET"))
    .GET()
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`;
    case "kotlin":
      return `import okhttp3.OkHttpClient
import okhttp3.Request

val client = OkHttpClient()
val request = Request.Builder()
    .url("\${System.getenv("VIDEH_API_BASE_URL")}/v1/me")
    .header(
        "Authorization",
        "Bearer \${System.getenv("VIDEH_API_KEY_ID")}:\${System.getenv("VIDEH_API_SECRET")}",
    )
    .build()
client.newCall(request).execute().use { println(it.body?.string()) }`;
    case "go":
      return `package main

import (
    "fmt"
    "io"
    "net/http"
    "os"
)

func main() {
    req, _ := http.NewRequest("GET", os.Getenv("VIDEH_API_BASE_URL")+"/v1/me", nil)
    req.Header.Set("Authorization", "Bearer "+
        os.Getenv("VIDEH_API_KEY_ID")+":"+os.Getenv("VIDEH_API_SECRET"))
    res, _ := http.DefaultClient.Do(req)
    defer res.Body.Close()
    body, _ := io.ReadAll(res.Body)
    fmt.Println(string(body))
}`;
    case "csharp":
      return `using System.Net.Http.Headers;

var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer",
        $"{Environment.GetEnvironmentVariable("VIDEH_API_KEY_ID")}:" +
        $"{Environment.GetEnvironmentVariable("VIDEH_API_SECRET")}");

var res = await client.GetAsync(
    $"{Environment.GetEnvironmentVariable("VIDEH_API_BASE_URL")}/v1/me");
Console.WriteLine(await res.Content.ReadAsStringAsync());`;
    case "php":
      return `<?php
$ch = curl_init("${c.baseUrl}/v1/me");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: ${c.auth}"],
]);
echo curl_exec($ch);`;
    case "ruby":
      return `require "net/http"
require "uri"

uri = URI("#{ENV['VIDEH_API_BASE_URL']}/v1/me")
req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer #{ENV['VIDEH_API_KEY_ID']}:#{ENV['VIDEH_API_SECRET']}"
res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
puts res.body`;
    case "swift":
      return `import Foundation

let base = ProcessInfo.processInfo.environment["VIDEH_API_BASE_URL"]!
let key = ProcessInfo.processInfo.environment["VIDEH_API_KEY_ID"]!
let secret = ProcessInfo.processInfo.environment["VIDEH_API_SECRET"]!

var req = URLRequest(url: URL(string: "\\(base)/v1/me")!)
req.setValue("Bearer \\(key):\\(secret)", forHTTPHeaderField: "Authorization")

let (data, _) = try await URLSession.shared.data(for: req)
print(String(data: data, encoding: .utf8)!)`;
    case "dart":
      return `import 'dart:convert';
import 'package:http/http.dart' as http;

final res = await http.get(
  Uri.parse('\${Platform.environment['VIDEH_API_BASE_URL']}/v1/me'),
  headers: {
    'Authorization':
        'Bearer \${Platform.environment['VIDEH_API_KEY_ID']}:'
        '\${Platform.environment['VIDEH_API_SECRET']}',
  },
);
print(jsonDecode(res.body));`;
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
    case "java":
      return `HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(System.getenv("VIDEH_API_BASE_URL") + "/v1/templates"))
    .header("Authorization", "Bearer "
        + System.getenv("VIDEH_API_KEY_ID") + ":"
        + System.getenv("VIDEH_API_SECRET"))
    .GET()
    .build();
// HttpClient client = HttpClient.newHttpClient();
// String body = client.send(request, HttpResponse.BodyHandlers.ofString()).body();`;
    case "kotlin":
      return `val request = Request.Builder()
    .url("\${System.getenv("VIDEH_API_BASE_URL")}/v1/templates")
    .header(
        "Authorization",
        "Bearer \${System.getenv("VIDEH_API_KEY_ID")}:\${System.getenv("VIDEH_API_SECRET")}",
    )
    .build()`;
    case "go":
      return `req, _ := http.NewRequest("GET", os.Getenv("VIDEH_API_BASE_URL")+"/v1/templates", nil)
req.Header.Set("Authorization", "Bearer "+
    os.Getenv("VIDEH_API_KEY_ID")+":"+os.Getenv("VIDEH_API_SECRET"))`;
    case "csharp":
      return `var res = await client.GetAsync(
    $"{Environment.GetEnvironmentVariable("VIDEH_API_BASE_URL")}/v1/templates");
var json = await res.Content.ReadAsStringAsync();`;
    case "php":
      return `<?php
$ch = curl_init("${c.baseUrl}/v1/templates");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["Authorization: ${c.auth}"],
]);
$templates = json_decode(curl_exec($ch), true)["data"];`;
    case "ruby":
      return `uri = URI("#{ENV['VIDEH_API_BASE_URL']}/v1/templates")
req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer #{ENV['VIDEH_API_KEY_ID']}:#{ENV['VIDEH_API_SECRET']}"`;
    case "swift":
      return `var req = URLRequest(url: URL(string: "\\(base)/v1/templates")!)
req.setValue("Bearer \\(key):\\(secret)", forHTTPHeaderField: "Authorization")`;
    case "dart":
      return `final res = await http.get(
  Uri.parse('\${Platform.environment['VIDEH_API_BASE_URL']}/v1/templates'),
  headers: {'Authorization': 'Bearer $keyId:$secret'},
);`;
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
      return `// Node.js 18+ — server-side only
const res = await fetch(
  \`\${process.env.VIDEH_API_BASE_URL}/v1/\${process.env.VIDEH_PHONE_NUMBER_ID}/messages\`,
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.VIDEH_API_KEY_ID}:\${process.env.VIDEH_API_SECRET}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: "919876543210",
      template: {
        name: "order_update",
        language: { code: "en" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: "Prashant" },
            { type: "text", text: "ORD-88421" },
          ],
        }],
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
        "components": [{
            "type": "body",
            "parameters": [
                {"type": "text", "text": "Prashant"},
                {"type": "text", "text": "ORD-88421"},
            ],
        }],
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
    case "java":
      return `import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;

String json = """
{
  "to": "919876543210",
  "template": {
    "name": "order_update",
    "language": { "code": "en" },
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Prashant" },
        { "type": "text", "text": "ORD-88421" }
      ]
    }]
  }
}
""";

HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(System.getenv("VIDEH_API_BASE_URL")
        + "/v1/" + System.getenv("VIDEH_PHONE_NUMBER_ID") + "/messages"))
    .header("Authorization", "Bearer "
        + System.getenv("VIDEH_API_KEY_ID") + ":"
        + System.getenv("VIDEH_API_SECRET"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
    .build();

HttpClient client = HttpClient.newHttpClient();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`;
    case "kotlin":
      return `import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

val json = """
{
  "to": "919876543210",
  "template": {
    "name": "order_update",
    "language": { "code": "en" },
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Prashant" },
        { "type": "text", "text": "ORD-88421" }
      ]
    }]
  }
}
""".trimIndent()

val body = json.toRequestBody("application/json".toMediaType())
val request = Request.Builder()
    .url("\${System.getenv("VIDEH_API_BASE_URL")}/v1/\${System.getenv("VIDEH_PHONE_NUMBER_ID")}/messages")
    .header(
        "Authorization",
        "Bearer \${System.getenv("VIDEH_API_KEY_ID")}:\${System.getenv("VIDEH_API_SECRET")}",
    )
    .post(body)
    .build()

OkHttpClient().newCall(request).execute().use { println(it.body?.string()) }`;
    case "go":
      return `package main

import (
    "bytes"
    "fmt"
    "io"
    "net/http"
    "os"
)

func main() {
    json := []byte(\`{
  "to": "919876543210",
  "template": {
    "name": "order_update",
    "language": { "code": "en" },
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Prashant" },
        { "type": "text", "text": "ORD-88421" }
      ]
    }]
  }
}\`)

    url := os.Getenv("VIDEH_API_BASE_URL") + "/v1/" + os.Getenv("VIDEH_PHONE_NUMBER_ID") + "/messages"
    req, _ := http.NewRequest("POST", url, bytes.NewBuffer(json))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer "+
        os.Getenv("VIDEH_API_KEY_ID")+":"+os.Getenv("VIDEH_API_SECRET"))

    res, _ := http.DefaultClient.Do(req)
    defer res.Body.Close()
    body, _ := io.ReadAll(res.Body)
    fmt.Println(string(body))
}`;
    case "csharp":
      return `using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

var payload = new {
    to = "919876543210",
    template = new {
        name = "order_update",
        language = new { code = "en" },
        components = new[] {
            new {
                type = "body",
                parameters = new[] {
                    new { type = "text", text = "Prashant" },
                    new { type = "text", text = "ORD-88421" },
                },
            },
        },
    },
};

var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer",
        $"{Environment.GetEnvironmentVariable("VIDEH_API_KEY_ID")}:" +
        $"{Environment.GetEnvironmentVariable("VIDEH_API_SECRET")}");

var content = new StringContent(
    JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
var url = $"{Environment.GetEnvironmentVariable("VIDEH_API_BASE_URL")}" +
    $"/v1/{Environment.GetEnvironmentVariable("VIDEH_PHONE_NUMBER_ID")}/messages";
var res = await client.PostAsync(url, content);
Console.WriteLine(await res.Content.ReadAsStringAsync());`;
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
    case "ruby":
      return `require "net/http"
require "json"

uri = URI("#{ENV['VIDEH_API_BASE_URL']}/v1/#{ENV['VIDEH_PHONE_NUMBER_ID']}/messages")
payload = {
  to: "919876543210",
  template: {
    name: "order_update",
    language: { code: "en" },
    components: [{
      type: "body",
      parameters: [
        { type: "text", text: "Prashant" },
        { type: "text", text: "ORD-88421" },
      ],
    }],
  },
}

req = Net::HTTP::Post.new(uri)
req["Authorization"] = "Bearer #{ENV['VIDEH_API_KEY_ID']}:#{ENV['VIDEH_API_SECRET']}"
req["Content-Type"] = "application/json"
req.body = payload.to_json
res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
puts res.body`;
    case "swift":
      return `import Foundation

let payload: [String: Any] = [
  "to": "919876543210",
  "template": [
    "name": "order_update",
    "language": ["code": "en"],
    "components": [[
      "type": "body",
      "parameters": [
        ["type": "text", "text": "Prashant"],
        ["type": "text", "text": "ORD-88421"],
      ],
    ]],
  ],
]

let base = ProcessInfo.processInfo.environment["VIDEH_API_BASE_URL"]!
let phoneId = ProcessInfo.processInfo.environment["VIDEH_PHONE_NUMBER_ID"]!
let key = ProcessInfo.processInfo.environment["VIDEH_API_KEY_ID"]!
let secret = ProcessInfo.processInfo.environment["VIDEH_API_SECRET"]!

var req = URLRequest(url: URL(string: "\\(base)/v1/\\(phoneId)/messages")!)
req.httpMethod = "POST"
req.setValue("application/json", forHTTPHeaderField: "Content-Type")
req.setValue("Bearer \\(key):\\(secret)", forHTTPHeaderField: "Authorization")
req.httpBody = try JSONSerialization.data(withJSONObject: payload)

let (data, _) = try await URLSession.shared.data(for: req)
print(String(data: data, encoding: .utf8)!)`;
    case "dart":
      return `import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

final payload = {
  'to': '919876543210',
  'template': {
    'name': 'order_update',
    'language': {'code': 'en'},
    'components': [
      {
        'type': 'body',
        'parameters': [
          {'type': 'text', 'text': 'Prashant'},
          {'type': 'text', 'text': 'ORD-88421'},
        ],
      },
    ],
  },
};

final res = await http.post(
  Uri.parse(
    '\${Platform.environment['VIDEH_API_BASE_URL']}/v1/'
    '\${Platform.environment['VIDEH_PHONE_NUMBER_ID']}/messages',
  ),
  headers: {
    'Authorization':
        'Bearer \${Platform.environment['VIDEH_API_KEY_ID']}:'
        '\${Platform.environment['VIDEH_API_SECRET']}',
    'Content-Type': 'application/json',
  },
  body: jsonEncode(payload),
);
print(jsonDecode(res.body));`;
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
