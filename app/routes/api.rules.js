import { json } from "@remix-run/node";
import { getMilestones } from "../models/GiftMilestone.server.js";

/**
 * Public endpoint that serves active gift rules as JSON.
 * Called by the storefront script. No auth required — shop passed as query param.
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ rules: [] }, { status: 400 });
  }

  const milestones = await getMilestones(shop);
  const activeRules = milestones
    .filter((m) => m.isActive)
    .map((m) => {
      const variantNumericId = m.giftVariantId.split("/").pop();
      return {
        thresholdAmount: m.thresholdAmount,
        variantNumericId: parseInt(variantNumericId, 10),
        giftProductTitle: m.giftProductTitle,
      };
    });

  return json(
    { rules: activeRules },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};
