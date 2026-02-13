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

// Remove draft/duplicate suffixes like "(Copy)" from emails/subject.
function cleanProductForEmail(productName) {
  return normalizeName(productName).replace(/\s*\(copy\)\s*$/i, "").trim();
}

const MATCH_RULES = [
  { contains: "Killarney Town", folder: "Town" },
  { contains: "Discover Killarney National Park", folder: "National" },
  { contains: "Hag", folder: "Hags" },
  { contains: "Muckross Park Revealed", folder: "Muckross" },
  { contains: "Ross Island Uncovered", folder: "Ross" },
];

async function sendAccessEmail({ to, productName, accessUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  // Replies will go here (you said this inbox works today)
  const replyTo = process.env.SUPPORT_REPLY_TO || "info@killarneyaudiotours.com";

  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  if (!from) throw new Error("Missing RESEND_FROM_EMAIL");
  if (!to) throw new Error("Missing customer email");

  const displayName = cleanProductForEmail(productName);
  const subject = `Your Tour Access Link – ${displayName}`;

  // Plain-text: URL on its own line => most clients auto-link it
  const text = [
    "Thanks for your purchase!",
    "",
    `Tour: ${displayName}`,
    "",
    "Your access link:",
    accessUrl,
    "",
    "For security reasons, this access link can be opened up to 4 times.",
    "If you have any trouble accessing your tour, just reply to this email.",
    "",
    "Enjoy your tour!",
    "Killarney Audio Tours",
  ].join("\n");

  // HTML: include BOTH a button and a visible clickable URL
  const html = `
<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height:1.6; font-size:16px;">
  <h2 style="margin:0 0 12px 0;">Your Tour Access</h2>
  <p style="margin:0 0 12px 0;">Thanks for your purchase!</p>
  <p style="margin:0 0 16px 0;"><strong>${displayName}</strong></p>

  <p style="margin:0 0 16px 0;">
    <a href="${accessUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;text-decoration:none;background:#111;color:#fff;">
      Open your tour
    </a>
  </p>

  <p style="margin:0 0 8px 0;"><strong>Or use this link:</strong></p>
  <p style="margin:0 0 16px 0; word-break: break-word;">
    <a href="${accessUrl}">${accessUrl}</a>
  </p>

  <p style="margin:0 0 12px 0; color:#555;">
    For security reasons, this access link can be opened up to <strong>4</strong> times.
  </p>

  <p style="margin:0 0 12px 0; color:#555;">
    If you have any trouble accessing your tour, simply reply to this email.
  </p>

  <p style="margin:0;">Enjoy your experience,<br/>Killarney Audio Tours</p>
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
      replyTo, // ✅ replies go to your inbox
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend error (${response.status}): ${err}`);
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

    if (!orderId) return { statusCode: 400, body: "Missing order ID" };
    if (!productName) return { statusCode: 400, body: "Missing product name" };

    // Dedupe by order_id (prevents duplicate emails on webhook retries)
    const { data: existing, error: existingError } = await supabase
      .from("tokens")
      .select("token, tour_folder, product")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    if (existing?.token) {
      const existingUrl = `https://dulcet-sorbet-41b108.netlify.app/access?token=${existing.token}`;
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          alreadyProcessed: true,
          accessUrl: existingUrl,
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          message: "Product not recognized (no MATCH_RULE matched).",
          productName,
        }),
      };
    }

    const tourFolder = match.folder;

    // Generate token
    const token = crypto.randomBytes(16).toString("hex");

    // Expiry set far future
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");

    // Store token
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

    // Send access email
    await sendAccessEmail({
      to: customerEmail,
      productName,
      accessUrl,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        productName,
        tourFolder,
        accessUrl,
        emailedTo: customerEmail || null,
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
