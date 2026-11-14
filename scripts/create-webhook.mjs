import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("Error: STRIPE_SECRET_KEY is not set in environment.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const rawSiteUrl =
  process.argv[2] ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://YOUR-APP.vercel.app";

const baseUrl = rawSiteUrl.replace(/\/+$/, "");
const webhookUrl = baseUrl.endsWith("/api/stripe/webhook")
  ? baseUrl
  : `${baseUrl}/api/stripe/webhook`;

if (webhookUrl.includes("YOUR-APP.vercel.app")) {
  console.error(
    "Please replace https://YOUR-APP.vercel.app with your deployed Vercel production URL (via NEXT_PUBLIC_SITE_URL in .env.local or as a CLI argument)."
  );
  process.exit(1);
}

const endpoint = await stripe.webhookEndpoints.create({
  url: webhookUrl,
  connect: true,
  enabled_events: ["checkout.session.completed", "account.updated"],
});

console.log("Webhook endpoint registered:", endpoint.url);
console.log("Endpoint ID:", endpoint.id);
console.log("Signing secret:", endpoint.secret);
