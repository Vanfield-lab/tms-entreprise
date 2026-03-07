// supabase/functions/reset-password/index.ts
// Place at: supabase/functions/reset-password/index.ts
// Deploy: supabase functions deploy reset-password
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // ── Build service-role admin client ─────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── Extract caller JWT ───────────────────────────────────────────────────
    // supabase.functions.invoke() sends the session token in Authorization header.
    // We also accept it inside the request body as a fallback.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized — no bearer token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Verify the caller's identity ─────────────────────────────────────────
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — " + (authErr?.message ?? "invalid token") }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // ── Check caller is admin ─────────────────────────────────────────────────
    const { data: profile } = await adminClient
      .from("profiles")
      .select("system_role")
      .eq("user_id", caller.id)
      .single();

    if (!profile || profile.system_role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden — admin role required" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const { target_user_id, new_password } = await req.json() as {
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

    // ── Reset the password ────────────────────────────────────────────────────
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    );

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    console.log(`[reset-password] admin=${caller.id} reset password for user=${target_user_id}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[reset-password] unhandled:", err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});