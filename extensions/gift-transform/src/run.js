/**
 * Cart Transform Function — Gift Milestone
 *
 * Reads milestone rules from a shop metafield and sets gift line items
 * (identified by the _gift_milestone attribute) to $0.00.
 *
 * The storefront JS is responsible for adding/removing the gift line items.
 * This function only handles zeroing out their price at checkout.
 */

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const operations = [];

  // Parse rules from metafield
  const rulesMetafield = input.cartTransform?.metafield?.value;
  if (!rulesMetafield) {
    return { operations: [] };
  }

  let rules;
  try {
    rules = JSON.parse(rulesMetafield);
  } catch {
    return { operations: [] };
  }

  if (!Array.isArray(rules) || rules.length === 0) {
    return { operations: [] };
  }

  // Build a set of gift variant IDs for quick lookup
  const giftVariantIds = new Set(rules.map((r) => r.giftVariantId));

  // Calculate cart subtotal excluding gift items
  let nonGiftSubtotal = 0;
  const giftLines = [];

  for (const line of input.cart.lines) {
    const isGift = line.attribute?.value === "true";
    const variantId = line.merchandise?.id;

    if (isGift && variantId && giftVariantIds.has(variantId)) {
      giftLines.push(line);
    } else {
      nonGiftSubtotal += parseFloat(line.cost.totalAmount.amount);
    }
  }

  // For each gift line, check if the threshold is still met and zero out price
  for (const giftLine of giftLines) {
    const variantId = giftLine.merchandise?.id;
    const rule = rules.find((r) => r.giftVariantId === variantId);

    if (rule && nonGiftSubtotal >= rule.thresholdAmount) {
      // Zero out the price using an update operation
      operations.push({
        update: {
          cartLineId: giftLine.id,
          price: {
            adjustment: {
              fixedPricePerUnit: {
                amount: "0",
              },
            },
          },
        },
      });
    }
  }

  return { operations };
}
