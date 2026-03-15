import { authenticate } from "../shopify.server.js";
import { deleteAllMilestones } from "../models/GiftMilestone.server.js";

export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await deleteAllMilestones(shop);
      break;
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // Mandatory GDPR webhooks — no customer data stored
      break;
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
