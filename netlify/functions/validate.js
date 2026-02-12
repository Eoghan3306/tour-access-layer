import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const token = event.queryStringParameters?.token;

    if (!token) {
      return { statusCode: 400, body: "Missing token" };
    }

    // 1) Fetch token record
    const { data, error } = await supabase
      .from("tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !data) {
      return { statusCode: 403, body: "Invalid token" };
    }

    // 2) Expiry check
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { statusCode: 403, body: "Token expired" };
    }

    // 3) Usage check
    const uses = data.uses ?? 0;
    const maxUses = data.max_uses ?? 0;

    if (maxUses > 0 && uses >= maxUses) {
      return { statusCode: 403, body: "Usage limit exceeded" };
    }

    // 4) Ensure we know which tour folder to load
    if (!data.tour_folder) {
      return { statusCode: 500, body: "Token record missing tour_folder" };
    }

    // 5) Increment usage
    const { error: updateError } = await supabase
      .from("tokens")
      .update({ uses: uses + 1 })
      .eq("token", token);

    if (updateError) {
      return { statusCode: 500, body: "Failed to update usage count" };
    }

    // 6) Redirect into the tour inside THIS site
    // IMPORTANT: your tour files have mixed casing: Index.html vs index.html
    // We'll handle that by using the actual file names:
    const folder = data.tour_folder;

    // Your repo shows:
    // Hags/Index.html
    // Muckross/Index.html
    // National/Index.html
    // Town/index.html (you mentioned line 454 earlier; check actual filename)
    // Ross/index.html
    //
    // We'll try Index.html first, and if you standardize later, we simplify.
    const candidate1 = `/tours/${folder}/Index.html?token=${encodeURIComponent(token)}`;
    const candidate2 = `/tours/${folder}/index.html?token=${encodeURIComponent(token)}`;

    // Use Index.html by default; if Town/Ross use lowercase, we can adjust later.
    const location =
      folder === "Ross" || folder === "Town" ? candidate2 : candidate1;

    return {
      statusCode: 302,
      headers: { Location: location },
    };
  } catch (err) {
    return { statusCode: 500, body: "Server error: " + err.message };
  }
}
