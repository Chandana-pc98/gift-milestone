import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { getMilestones } from "../models/GiftMilestone.server.js";

/**
 * App proxy endpoint that serves active gift milestone rules as JSON.
 * Storefront JS fetches this to know which gifts to add/remove.
 * URL: /apps/gift-milestones (configured in shopify.app.toml)
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return json({ rules: [] }, { status: 401 });
  }

  const milestones = await getMilestones(session.shop);
  const activeRules = milestones
    .filter((m) => m.isActive)
    .map((m) => {
      // Extract numeric variant ID from GID for the AJAX Cart API
      const variantNumericId = m.giftVariantId.split("/").pop();
      return {
        thresholdAmount: m.thresholdAmount,
        giftVariantId: m.giftVariantId,
        variantNumericId: parseInt(variantNumericId, 10),
        giftProductTitle: m.giftProductTitle,
      };
    });

  return json(
    { rules: activeRules },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};
