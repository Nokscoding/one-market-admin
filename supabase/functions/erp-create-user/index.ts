import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAFF_ROLES = new Set([
  "SUPER_ADMIN",
  "ACCOUNTANT",
  "MODERATOR",
  "CUSTOMER_SERVICE",
  "OPERATIONS_MANAGER",
  "COURIER",
]);
const MARKETPLACE_ROLES = new Set(["client", "courier", "admin", "global_admin"]);
const VEHICLE_TYPES = new Set(["moto", "voiture", "velo", "pied", "autre"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "SERVER_CONFIG_ERROR" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const caller = authData?.user;
  if (authError || !caller) return json({ error: "AUTH_INVALID" }, 401);

  const { data: staff, error: staffLookupError } = await admin
    .from("admin_staff")
    .select("staff_role,status")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (staffLookupError || !staff || staff.status !== "active" || staff.staff_role !== "SUPER_ADMIN") {
    return json({ error: "ERP_SUPER_ADMIN_ONLY" }, 403);
  }

  try {
    const body = await req.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const fullName = String(body?.full_name ?? "").trim();
    const password = String(body?.password ?? "");
    const marketplaceRole = String(body?.marketplace_role ?? "client");
    const staffRole = body?.staff_role ? String(body.staff_role) : null;
    const phone = String(body?.phone ?? "").trim();
    const vehicleType = String(body?.vehicle_type ?? "moto");
    const vehicleLabel = String(body?.vehicle_label ?? "").trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "INVALID_EMAIL" }, 400);
    if (fullName.length < 2 || fullName.length > 120) return json({ error: "INVALID_NAME" }, 400);
    if (password.length < 8) return json({ error: "PASSWORD_TOO_SHORT" }, 400);
    if (!MARKETPLACE_ROLES.has(marketplaceRole)) return json({ error: "INVALID_MARKETPLACE_ROLE" }, 400);
    // Sellers are client accounts with seller_enabled granted by the seller approval workflow.
    if (marketplaceRole === "seller") return json({ error: "SELLER_USES_CLIENT_ACCOUNT" }, 400);
    if (staffRole && !STAFF_ROLES.has(staffRole)) return json({ error: "INVALID_STAFF_ROLE" }, 400);
    if (staffRole === "SUPER_ADMIN" && marketplaceRole === "client") return json({ error: "CLIENT_CANNOT_BE_SUPER_ADMIN" }, 400);
    if (marketplaceRole === "courier" && staffRole !== "COURIER") return json({ error: "COURIER_REQUIRES_ERP_ROLE" }, 400);
    if (staffRole === "COURIER" && marketplaceRole !== "courier") return json({ error: "COURIER_ROLE_MISMATCH" }, 400);
    if (staffRole === "COURIER" && !VEHICLE_TYPES.has(vehicleType)) return json({ error: "INVALID_VEHICLE_TYPE" }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
      app_metadata: staffRole === "COURIER" ? { recruited_by: "one_market_erp", nks_staff_type: "courier" } : {},
    });

    if (createError || !created?.user) {
      const message = createError?.message?.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return json({ error: "EMAIL_ALREADY_EXISTS" }, 409);
      }
      return json({ error: "AUTH_CREATE_FAILED" }, 400);
    }

    const userId = created.user.id;
    try {
      const { error: profileError } = await admin.from("profiles").update({
        role: marketplaceRole,
        full_name: fullName,
        phone: phone || null,
        account_status: "active",
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      if (profileError) throw profileError;

      if (staffRole) {
        const { error: staffError } = await admin.from("admin_staff").insert({
          user_id: userId,
          staff_role: staffRole,
          full_name: fullName,
          status: "active",
          created_by: caller.id,
        });
        if (staffError) throw staffError;
      }

      let courierProfile = null;
      if (staffRole === "COURIER") {
        const { data: courier, error: courierError } = await admin.from("courier_profiles").insert({
          user_id: userId,
          phone: phone || null,
          vehicle_type: vehicleType,
          vehicle_label: vehicleLabel || null,
          status: "active",
          is_available: true,
        }).select("employee_code,vehicle_type,vehicle_label,status,is_available").single();
        if (courierError) throw courierError;
        courierProfile = courier;
      }

      await admin.from("admin_audit_logs").insert({
        staff_user_id: caller.id,
        action: staffRole === "COURIER" ? "courier.create" : "user.create",
        entity_type: staffRole === "COURIER" ? "courier" : "profile",
        entity_id: userId,
        after_data: {
          email,
          full_name: fullName,
          marketplace_role: marketplaceRole,
          staff_role: staffRole,
          vehicle_type: staffRole === "COURIER" ? vehicleType : null,
        },
        metadata: { source: "erp-create-user" },
      });

      return json({ id: userId, email, full_name: fullName, marketplace_role: marketplaceRole, staff_role: staffRole, courier: courierProfile }, 201);
    } catch (_) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ error: "USER_PROVISION_FAILED" }, 500);
    }
  } catch (_) {
    return json({ error: "CREATE_USER_FAILED" }, 400);
  }
});
