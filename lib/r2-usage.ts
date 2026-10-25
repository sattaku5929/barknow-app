import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2BucketName, r2Client } from "@/lib/r2";

// The limit is deliberately half of the 10 GB-month Standard free allowance.
// This is a safety buffer, not a Cloudflare billing hard cap.
export const WAN_MEDIA_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;
export const WAN_MEDIA_WARNING_BYTES = 4 * 1024 * 1024 * 1024;

export async function inspectR2Usage() {
  const client = r2Client();
  const bucket = r2BucketName();
  let bytes = 0;
  let objects = 0;
  let cursor: string | undefined;
  let pages = 0;
  do {
    // Includes chat uploads, saved content, and any unreferenced files.
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucket, ContinuationToken: cursor, MaxKeys: 1000,
    }));
    for (const object of result.Contents ?? []) {
      bytes += object.Size ?? 0;
      objects++;
    }
    cursor = result.IsTruncated ? result.NextContinuationToken : undefined;
    pages++;
    if (pages > 10000 || (result.IsTruncated && !cursor)) throw new Error("R2 listing was incomplete");
  } while (cursor);
  return { bytes, objects, limitBytes: WAN_MEDIA_BUDGET_BYTES, warningBytes: WAN_MEDIA_WARNING_BYTES };
}

export async function ensureR2Budget(newBytes: number) {
  if (!Number.isSafeInteger(newBytes) || newBytes <= 0) throw new Error("Invalid upload size");
  const usage = await inspectR2Usage();
  if (usage.bytes + newBytes > WAN_MEDIA_BUDGET_BYTES) {
    throw new Error("保存容量が上限に達しています。運営にお問い合わせください");
  }
  return usage;
}
