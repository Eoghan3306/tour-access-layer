import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

// Match rules: if product name CONTAINS one of these, route to folder.
const MATCH_RULES = [
  { contains: "Killarney Town", folder: "Town" },
  { contains: "Discover Killarney National Park", folder: "National" },
  { contains: "Hag", folder: "Hags" },
  { contains: "Muckross Park Revealed", folder: "Muckross" },
  { contains: "Ross Island Uncovered", folder: "Ross" },
];

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    const rawProductName =
      body?.data?.attributes?.first_order_item?.product_name ||
      body?.data?.line_items?.[0]?.name ||
      body?.data?.attributes?.product_name;

    const productName = normalizeName(rawProductName);

    if (!productName) {
      return { statusCode: 400, body: "Missing product name in webhook payload" };
    }

    // Find matching folder
    const match = MATCH_RULES.find((r) =>
      productName.toLowerCase().includes(r.contains.toLowerCase())
    );

    if (!match) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          message: "Product name not recognized. Add a MATCH_RULE.",
          receivedProductName: productName,
        }),
      };
    }

    const tourFolder = match.folder;

    // Generate secure token
    const token = crypto.randomBytes(16).toString("hex");

    // Set expiry to January 1, 2099 (effectively unlimited)
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");

    const { error } = await supabase.from("tokens").insert([
      {
        token,
        product: productName,
        tour_folder: tourFolder,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        uses: 0,
        max_uses: 4,
      },
    ]);

    if (error) throw new Error(error.message);

    const accessUrl = `https://dulcet-sorbet-41b108.netlify.app/access?token=${token}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        productName,
        tourFolder,
        accessUrl,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: "Webhook error: " + err.message };
  }
}
