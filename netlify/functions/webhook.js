import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1) Normalize “smart quotes” etc so matching works reliably
function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .trim()
    .replace(/[’‘]/g, "'") // curly apostrophes → normal apostrophe
    .replace(/[“”]/g, '"') // curly quotes → normal quotes
    .replace(/\s+/g, " "); // collapse repeated spaces
}

// 2) MUST match Lemon Squeezy product names (after normalization)
// Folder values MUST match your /tours folder names exactly.
const PRODUCT_TO_FOLDER = {
  "Killarney Town - FREE! ◷ 40-60min 3km": "Town",
  "Discover Killarney National Park ◷ 50-70min 5km": "National",
  "Hag’s Glen: Path to the Devil’s Ladder ◷ 80-100mins 5km": "Hags",
  "Muckross Park Revealed: History, Folklore & Wildlife ◷ 50-70min 5km": "Muckross",
  "Ross Island Uncovered: Castles, Copper & Conflict ◷ 50-70min 5km": "Ross",
};

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    // Try multiple likely payload locations (Lemon Squeezy varies)
    const rawProductName =
      body?.data?.attributes?.first_order_item?.product_name ||
      body?.data?.line_items?.[0]?.name ||
      body?.data?.attributes?.product_name;

    const productName = normalizeName(rawProductName);

    if (!productName) {
      return { statusCode: 400, body: "Missing product name in webhook payload" };
    }

    // Normalize the keys of PRODUCT_TO_FOLDER too (for safety)
    const normalizedMap = Object.fromEntries(
      Object.entries(PRODUCT_TO_FOLDER).map(([k, v]) => [normalizeName(k), v])
    );

    const tourFolder = normalizedMap[productName];

    if (!tourFolder) {
      // Return 200 so Lemon Squeezy doesn't keep retrying,
      // but include productName so you can see what LS actually sent.
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          message: "Product name not recognized. Add it to PRODUCT_TO_FOLDER.",
          receivedProductName: productName,
        }),
      };
    }

    // Generate secure token
    const token = crypto.randomBytes(16).toString("hex");

    // Expiry: change if you want
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // For free tour you can still store tokens (fine),
    // or you can skip storage by returning here.
    // If you'd rather SKIP storing for free tour, uncomment below:

    // if (tourFolder === "Town") {
    //   return {
    //     statusCode: 200,
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ success: true, message: "Free product - no token stored." }),
    //   };
    // }

    const { error } = await supabase.from("tokens").insert([
      {
        token,
        product: productName,
        tour_folder: tourFolder,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        uses: 0,
        max_uses: 3,
      },
    ]);

    if (error) throw new Error(error.message);

    // This is the link you will eventually send to buyers
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
