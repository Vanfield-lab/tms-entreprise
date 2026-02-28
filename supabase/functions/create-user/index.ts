// supabase/functions/create-user/index.ts
// Deploy with: supabase functions deploy create-user
// This Edge Function runs with the service-role key, allowing admin to create auth users
// WITHOUT needing to open the Supabase dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify the calling user is an admin via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a regular client to verify the caller's identity
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check the caller is an admin
    const { data: profile } = await callerClient
      .from("profiles")
      .select("system_role")
      .eq("user_id", caller.id)
      .single();

    if (!profile || profile.system_role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse the request body
    const {
      email,
      password,
      full_name,
      system_role,
      division_id,
      unit_id,
      position_title,
      request_id, // optional: user_request id to approve atomically
    } = await req.json();

    if (!email || !password || !full_name || !system_role) {
      return new Response(JSON.stringify({ error: "email, password, full_name, system_role are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Use service-role client to create the auth user
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email verification step needed
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = newUser.user.id;

    // 4. Create their profile row
    const { error: profileError } = await adminClient.from("profiles").insert({
      user_id: newUserId,
      full_name,
      system_role,
      division_id: division_id || null,
      unit_id: unit_id || null,
      position_title: position_title || null,
      status: "active",
    });

    if (profileError) {
      // Rollback: delete the auth user we just created
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: `Profile creation failed: ${profileError.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. If a request_id was provided, mark the user_request as approved
    if (request_id) {
      await adminClient
        .from("user_requests")
        .update({ status: "approved", resolved_at: new Date().toISOString(), resolved_user_id: newUserId })
        .eq("id", request_id);
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});