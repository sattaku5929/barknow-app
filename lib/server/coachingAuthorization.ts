import { serviceSupabase } from "@/lib/server/supabase";

/**
 * Defense in depth for write endpoints. Database RLS and session INSERT trigger
 * enforce the same policy even if a client skips the HTTP endpoint.
 */
export async function canWriteCoaching(ownerId: string, dogId: string): Promise<boolean> {
  const { data, error } = await serviceSupabase().rpc("wt_coaching_write_allowed", {
    target_owner_id: ownerId,
    target_dog_id: dogId,
  });
  if (!error) return data === true;
  // During deployment ordering only: keep current access until migration
  // exists. Any other (network/permission/SQL) error fails closed.
  if (error.code === "42883" || error.code === "PGRST202") return true;
  throw error;
}
