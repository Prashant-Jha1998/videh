import { MESH_PEER_CONNECT_BATCH_SIZE, MESH_PEER_CONNECT_STAGGER_MS } from "@/lib/callStability";

/** Connect WebRTC peer channels in batches — prevents group-call crashes from parallel ICE storms. */
export async function connectMeshPeersStaggered(
  channels: string[],
  connectOne: (channel: string) => Promise<void>,
  opts?: { staggerMs?: number; batchSize?: number },
): Promise<void> {
  const staggerMs = opts?.staggerMs ?? MESH_PEER_CONNECT_STAGGER_MS;
  const batchSize = opts?.batchSize ?? MESH_PEER_CONNECT_BATCH_SIZE;
  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    await Promise.all(batch.map((ch) => connectOne(ch)));
    if (i + batchSize < channels.length) {
      await new Promise((r) => setTimeout(r, staggerMs));
    }
  }
}
