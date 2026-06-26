import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import type { Chat, Message } from "@/context/AppContext";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function messageLine(chat: Chat, m: Message, myName: string): string {
  const who = m.senderId === "me" ? myName : (m.senderName || chat.name || "Contact");
  let body: string;
  switch (m.type) {
    case "image": body = m.text && m.text !== "📷 Photo" ? `[image] ${m.text}` : "[image]"; break;
    case "video": body = m.text && m.text !== "🎥 Video" ? `[video] ${m.text}` : "[video]"; break;
    case "audio": body = "[voice message]"; break;
    case "document": body = `[document] ${m.text ?? ""}`.trim(); break;
    case "location": body = "[location]"; break;
    case "contact": body = "[contact]"; break;
    case "call": body = m.text || "[call]"; break;
    case "deleted": body = "This message was deleted"; break;
    default: body = m.text ?? "";
  }
  return `[${formatStamp(m.timestamp)}] ${who}: ${body}`;
}

/** Builds a Videh plain-text transcript of all chats. */
export function buildChatsTextExport(chats: Chat[], myName: string): string {
  const lines: string[] = [];
  lines.push(`Videh chat export`);
  lines.push(`Exported: ${formatStamp(Date.now())}`);
  lines.push(`Chats: ${chats.length}`);
  lines.push("");

  for (const chat of chats) {
    lines.push("========================================");
    lines.push(chat.isGroup ? `Group: ${chat.name}` : `Chat: ${chat.name}`);
    lines.push("========================================");
    const msgs = [...(chat.messages ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    if (msgs.length === 0) {
      lines.push("(no messages)");
    } else {
      for (const m of msgs) lines.push(messageLine(chat, m, myName));
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Builds a JSON backup of all chats (restorable structure). */
export function buildChatsJsonBackup(chats: Chat[], myName: string): string {
  return JSON.stringify(
    {
      app: "Videh",
      kind: "chat-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      owner: myName,
      chatCount: chats.length,
      chats: chats.map((c) => ({
        id: c.id,
        name: c.name,
        isGroup: c.isGroup,
        messages: (c.messages ?? []).map((m) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          type: m.type,
          text: m.text,
          mediaUrl: m.mediaUrl,
          timestamp: m.timestamp,
        })),
      })),
    },
    null,
    2,
  );
}

async function writeAndShare(filename: string, contents: string, mimeType: string, dialogTitle: string): Promise<string> {
  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
  if (!dir) throw new Error("No writable storage directory.");
  const path = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(path, contents, { encoding: FileSystem.EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType, dialogTitle, UTI: mimeType === "application/json" ? "public.json" : "public.plain-text" });
  }
  return path;
}

/** Exports all chats as a shareable .txt file. Returns the saved file path. */
export async function exportChatsToFile(chats: Chat[], myName: string): Promise<string> {
  const text = buildChatsTextExport(chats, myName);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return writeAndShare(`videh-chats-${stamp}.txt`, text, "text/plain", "Export Videh chats");
}

/** Writes a JSON backup of all chats to local storage and offers to share it. */
export async function backupChatsToFile(chats: Chat[], myName: string): Promise<string> {
  const json = buildChatsJsonBackup(chats, myName);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return writeAndShare(`videh-backup-${stamp}.json`, json, "application/json", "Videh chat backup");
}
