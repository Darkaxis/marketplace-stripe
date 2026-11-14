import { formatPrice } from "@/lib/utils";

export interface SellerEmailPayload {
  sellerEmail: string;
  buyerEmail: string;
  message: string;
  listingId: string;
  listingTitle?: string;
  listingPrice?: number;
  listingUrl?: string;
}

export interface EmailResult {
  sent: boolean;
  provider: "resend" | "none";
  error?: string;
}

function sanitizeHeaderText(text: string): string {
  return text.replace(/[\r\n\0]+/g, " ").trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Triggers an email notification to the seller when a buyer sends a message.
 * Uses Resend REST API when RESEND_API_KEY is configured; otherwise logs and returns gracefully.
 */
export async function sendSellerNotificationEmail(
  payload: SellerEmailPayload
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress =
    process.env.EMAIL_FROM || "Marketplace <onboarding@resend.dev>";

  const itemTitle = sanitizeHeaderText(
    payload.listingTitle || "your Marketplace listing"
  ).slice(0, 200);
  const priceLabel =
    payload.listingPrice !== undefined
      ? ` (${formatPrice(payload.listingPrice)})`
      : "";
  const subject = `New Marketplace inquiry about "${itemTitle}"${priceLabel}`;

  const cleanSellerEmail = sanitizeHeaderText(payload.sellerEmail);
  const cleanBuyerEmail = sanitizeHeaderText(payload.buyerEmail);

  if (!apiKey) {
    console.info(
      `[Email Notification Skipped - RESEND_API_KEY not set] To: ${payload.sellerEmail} | Reply-To: ${payload.buyerEmail} | Subject: ${subject}`
    );
    return { sent: false, provider: "none" };
  }

  const safeTitle = escapeHtml(itemTitle);
  const safeBuyerEmail = escapeHtml(payload.buyerEmail);
  const safeMessage = escapeHtml(payload.message).replace(/\n/g, "<br />");
  const safeUrl = payload.listingUrl ? escapeHtml(payload.listingUrl) : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #050505; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: #1877F2; color: #ffffff; padding: 18px 24px;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 700;">New Message on Marketplace</h1>
      </div>
      <div style="padding: 24px;">
        <p style="margin: 0 0 12px; font-size: 14px; color: #4b5563;">
          You have a new inquiry about <strong>${safeTitle}${escapeHtml(priceLabel)}</strong>:
        </p>
        <div style="background: #F0F2F5; border-left: 4px solid #1877F2; border-radius: 6px; padding: 14px 16px; margin: 16px 0; font-size: 15px; line-height: 1.5; color: #050505;">
          ${safeMessage}
        </div>
        <p style="margin: 16px 0 4px; font-size: 13px; color: #4b5563;">
          <strong>Buyer email:</strong> <a href="mailto:${safeBuyerEmail}" style="color: #1877F2;">${safeBuyerEmail}</a>
        </p>
        <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280;">
          Hit <strong>Reply</strong> directly to this email to respond to the buyer.
        </p>
        ${
          safeUrl
            ? `<a href="${safeUrl}" style="display: inline-block; background: #1877F2; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 10px 18px; border-radius: 8px;">View Listing</a>`
            : ""
        }
      </div>
    </div>
  `;

  const text = [
    `New Marketplace inquiry about "${itemTitle}"${priceLabel}`,
    "",
    `From: ${payload.buyerEmail}`,
    `Message:`,
    payload.message,
    "",
    payload.listingUrl ? `View listing: ${payload.listingUrl}` : "",
    "Reply directly to this email to respond to the buyer.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [cleanSellerEmail],
        reply_to: cleanBuyerEmail,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error("Resend email API error:", response.status, errorBody);
      return {
        sent: false,
        provider: "resend",
        error: `Email provider returned ${response.status}`,
      };
    }

    return { sent: true, provider: "resend" };
  } catch (err) {
    console.error("Failed to send seller notification email:", err);
    return {
      sent: false,
      provider: "resend",
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}
