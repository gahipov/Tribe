import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller's identity using their own JWT
  const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await anonClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: corsHeaders });
  }

  const userId = user.id;
  const userEmail = user.email;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Delete the user's data across all known tables. Best-effort — a missing
  // table/column for one row shouldn't block deletion of the account itself.
  const deletions = [
    admin.from("workouts").delete().eq("user_id", userId),
    admin.from("workout_plans").delete().eq("user_id", userId),
    admin.from("meals").delete().eq("user_id", userId),
    admin.from("saved_meals").delete().eq("user_id", userId),
    admin.from("body_measurements").delete().eq("user_id", userId),
    admin.from("posts").delete().eq("user_id", userId),
    admin.from("comments").delete().eq("user_id", userId),
    admin.from("tribe_members").delete().eq("user_id", userId),
    admin.from("tribe_messages").delete().eq("user_id", userId),
    admin.from("workout_event_rsvps").delete().eq("user_id", userId),
    admin.from("workout_events").delete().eq("created_by", userId),
    admin.from("buddy_requests").delete().eq("from_user_id", userId),
    userEmail ? admin.from("buddy_requests").delete().eq("to_user_email", userEmail) : Promise.resolve(),
    admin.from("profiles").delete().eq("id", userId),
  ];
  await Promise.allSettled(deletions);

  // Best-effort cleanup of storage objects owned by this user
  try {
    const { data: avatarFiles } = await admin.storage.from("media").list(userId);
    if (avatarFiles?.length) {
      await admin.storage.from("media").remove(avatarFiles.map(f => `${userId}/${f.name}`));
    }
    const { data: bodyPhotoFiles } = await admin.storage.from("body-photos").list(`weight/${userId}`);
    if (bodyPhotoFiles?.length) {
      await admin.storage.from("body-photos").remove(bodyPhotoFiles.map(f => `weight/${userId}/${f.name}`));
    }
  } catch { /* storage cleanup is best-effort */ }

  // Finally, delete the auth user itself
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
});
