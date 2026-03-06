// supabase/functions/reset-password/index.ts
// Deploy: supabase functions deploy reset-password
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization")!;
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("system_role")
      .eq("user_id", user.id)
      .single();

    if (callerProfile?.system_role !== "admin") throw new Error("Admin access required");

    const { target_user_id, new_password } = await req.json();
    if (!target_user_id || !new_password) throw new Error("target_user_id and new_password required");
    if (new_password.length < 8) throw new Error("Password must be at least 8 characters");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
      password: new_password,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

