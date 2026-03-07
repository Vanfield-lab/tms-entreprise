// supabase/functions/reset-password/index.ts
//
// Resets a target user's password.
// Only admins (system_role = 'admin') can call this.
// Uses SUPABASE_SERVICE_ROLE_KEY — never expose this to the browser.
//
// Deploy: supabase functions deploy reset-password
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // ── 1. Verify the caller is authenticated ───────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized — no token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // Use the service-role client for all admin operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 2. Identify and authorise the caller ────────────────────────────────
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized — " + (authError?.message ?? "bad token") }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Only admins may reset other users' passwords
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("system_role")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile || callerProfile.system_role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden — admin role required" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── 3. Parse and validate the request body ──────────────────────────────
    const body = await req.json();
    const { target_user_id, new_password } = body as {
      target_user_id: string;
      new_password:   string;
    };

    if (!target_user_id || !new_password) {
      return new Response(JSON.stringify({ error: "target_user_id and new_password are required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (new_password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── 4. Prevent admins from accidentally locking themselves out ──────────
    // (optional safety guard — remove if you want admins to reset own password)
    if (target_user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Use your profile page to change your own password" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── 5. Reset the password via the admin API ─────────────────────────────
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    );

    if (updateError) {
      console.error("reset-password error:", updateError.message);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    console.log(`Password reset by admin ${caller.id} for user ${target_user_id}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("reset-password unhandled:", err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});