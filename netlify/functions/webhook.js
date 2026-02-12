import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Supabase client (uses Netlify Environment Variables)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// IMPORTANT: These product names must match what Lemon Squeezy sends.
// The folder values must match your folder names under /tours exactly.
const PRODUCT_TO_FOLDER = {
  "Muckross Park Revealed": "Muckross",
  "Hag's Glen": "Hags",
  "Discover Killarney National Park": "National",
  "Ross Island Uncovered": "Ross",
  "Killarney Town Tour": "Town",
};

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    // Try multiple likely payload locations (Lemon Squeezy varies by event type)
    const productName =
      body?.data?.attributes?.first_order_item?.product_name ||
      body?.data?.line_items?.[0]?.name ||
      body?.data?.attributes?.product_name;

    if (!productName) {
      return {
        statusCode: 400,
        body: "Missing product name in webhook payload",
      };
    }

    const tourFolder = PRODUCT_TO_FOLDER[productName];

    if (!tourFolder) {
      return {
        statusCode: 400,
        body: `Unknown product name: "${productName}". Add it to PRODUCT_TO_FOLDER.`,
      };
    }

    // Generate secure token
    const token = crypto.randomBytes(16).toString("hex");

    // Expiry (change to what you want)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Store in Supabase (matches your table columns + tour_folder)
    const { error } = await supabase.from("tokens").insert([
      {
        token: token,
        product: productName,
        tour_folder: tourFolder,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        uses: 0,
        max_uses: 3,
      },
    ]);

    if (error) {
      throw new Error(error.message);
    }

    // Access link (this is what you'll eventually deliver to the buyer)
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
    return {
      statusCode: 500,
      body: "Webhook error: " + err.message,
    };
  }
}
