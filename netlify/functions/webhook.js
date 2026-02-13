import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Normalize product names to avoid special character issues
function normalizeName(name) {
  if (!name) return "";
  return String(name)
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

// Product → Folder matching
const MATCH_RULES = [
  { contains: "Killarney Town", folder: "Town" },
  { contains: "Discover Killarney National Park", folder: "National" },
  { contains: "Hag", folder: "Hags" },
  { contains: "Muckross Park Revealed", folder: "Muckross" },
  { contains: "Ross Island Uncovered", folder: "Ross" },
];

// Send access email via Resend
async function sendAccessEmail({ to, productName, accessUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.SUPPORT_REPLY_TO;

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL");
  if (!to) throw new Error("Missing customer email");

  const subject = `Your Tour Access – ${productName}`;

  const text = `
Thanks for your purchase!

Your access link:
${accessUrl}

This link can be used on up to 4 devices.

If you need help, just reply to this email.

Enjoy your tour!
`.trim();

  const html = `
<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height:1.6;">
  <h2>Your Tour Access</h2>
  <p>Thanks for your purchase!</p>
  <p><strong>${productName}</strong></p>

  <p>
    <a href="${accessUrl}" 
       style="display:inline-block;padding:12px 18px;border-radius:8px;
              text-decoration:none;background:#000;color:#fff;">
       Open Your Tour
    </a>
  </p>

  <p>This link can be used on up to 4 devices.</p>
  <p>If you need help, just reply to this email.</p>
  <p>Enjoy your experience,<br/>Killarney Audio Tours</p>
</div>
`.trim();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error: ${err}`);
  }

  return response.json();
}

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || "{}");

    const orderId = String(body?.data?.id || "").trim();
    const customerEmail = String(body?.data?.attributes?.user_email || "").trim();

    const rawProductName =
      body?.data?.attributes?.first_order_item?.product_name ||
      body?.data?.line_items?.[0]?.name ||
      body?.data?.attributes?.product_name;

    const productName = normalizeName(rawProductName);

    if (!orderId) {
      return { statusCode: 400, body: "Missing order ID" };
    }

    if (!productName) {
      return { statusCode: 400, body: "Missing product name" };
    }

    // Check if this order was already processed
    const { data: existing, error: existingError } = await supabase
      .from("tokens")
      .select("token, tour_folder, product")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing?.token) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          alreadyProcessed: true,
          accessUrl: `https://dulcet-sorbet-41b108.netlify.app/access?token=${existing.token}`,
        }),
      };
    }

    // Match folder
    const match = MATCH_RULES.find((rule) =>
      productName.toLowerCase().includes(rule.contains.toLowerCase())
    );

    if (!match) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: "Product not recognized",
          productName,
        }),
      };
    }

    const tourFolder = match.folder;

    // Generate secure token
    const token = crypto.randomBytes(16).toString("hex");

    // Expiry set to 2099
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");

    const { error: insertError } = await supabase.from("tokens").insert([
      {
        order_id: orderId,
        token,
        product: productName,
        tour_folder: tourFolder,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        uses: 0,
        max_uses: 4,
      },
    ]);

    if (insertError) throw new Error(insertError.message);

    const accessUrl = `https://dulcet-sorbet-41b108.netlify.app/access?token=${token}`;

    // Send email
    await sendAccessEmail({
      to: customerEmail,
      productName,
      accessUrl,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        productName,
        tourFolder,
        accessUrl,
        emailed: true,
      }),
    };
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      statusCode: 500,
      body: "Webhook error: " + error.message,
    };
  }
}
