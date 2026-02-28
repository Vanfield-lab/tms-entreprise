// src/modules/users/services/userManagement.service.ts
import { supabase } from "@/lib/supabase";

export interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  system_role: string;
  division_id?: string | null;
  unit_id?: string | null;
  position_title?: string | null;
  request_id?: string | null; // if approving from a pending request
}

/**
 * Calls the `create-user` Edge Function which uses the service-role key
 * to create a Supabase Auth user + profile in one atomic step.
 * Only admins can call this (enforced server-side in the function).
 */
export async function createSystemUser(payload: CreateUserPayload): Promise<{ user_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const res = await supabase.functions.invoke("create-user", {
    body: payload,
  });

  if (res.error) throw new Error(res.error.message);
  if (res.data?.error) throw new Error(res.data.error);
  return res.data as { user_id: string };
}

/**
 * Reject a pending user request.
 */
export async function rejectUserRequest(requestId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("admin_reject_user_request", {
    p_request_id: requestId,
    p_reason: reason ?? "Rejected by admin",
  });
  if (error) throw error;
}

/**
 * List all profiles (for user management table in AdminLayout).
 */
export async function listProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,full_name,system_role,status,division_id,unit_id,position_title")
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

/**
 * Deactivate / reactivate a user profile.
 */
export async function setUserStatus(userId: string, status: "active" | "inactive"): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("user_id", userId);
  if (error) throw error;
}