import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    // Try to safely extract product name from LemonSqueezy payload
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

    // Generate secure token
    const token = crypto.randomBytes(16).toString("hex");

    // Set expiry (7 days example)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Insert into Supabase
    const { error } = await supabase.from("tokens").insert([
      {
        token: token,
        product: productName,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        uses: 0,
        max_uses: 3,
      },
    ]);

    if (error) throw error;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Token stored successfully",
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: "Webhook error: " + err.message,
    };
  }
}
