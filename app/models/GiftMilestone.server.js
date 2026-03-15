import prisma from "../db.server.js";

/**
 * Get all milestones for a shop, ordered by threshold ascending.
 */
export async function getMilestones(shop) {
  return prisma.giftMilestone.findMany({
    where: { shop },
    orderBy: { thresholdAmount: "asc" },
  });
}

/**
 * Get a single milestone by ID (scoped to shop for multi-tenant safety).
 */
export async function getMilestone(id, shop) {
  return prisma.giftMilestone.findFirst({
    where: { id, shop },
  });
}

/**
 * Create a new milestone rule and sync metafields.
 */
export async function createMilestone(shop, data, graphql) {
  const milestone = await prisma.giftMilestone.create({
    data: { shop, ...data },
  });
  await syncMetafield(shop, graphql);
  return milestone;
}

/**
 * Update an existing milestone rule and sync metafields.
 */
export async function updateMilestone(id, shop, data, graphql) {
  const milestone = await prisma.giftMilestone.update({
    where: { id },
    data,
  });
  await syncMetafield(shop, graphql);
  return milestone;
}

/**
 * Delete a milestone rule and sync metafields.
 */
export async function deleteMilestone(id, shop, graphql) {
  await prisma.giftMilestone.delete({ where: { id } });
  await syncMetafield(shop, graphql);
}

/**
 * Delete all milestones for a shop (used on app uninstall).
 */
export async function deleteAllMilestones(shop) {
  await prisma.giftMilestone.deleteMany({ where: { shop } });
}

/**
 * Sync all active rules for a shop to a shop-level metafield.
 * The Cart Transform Function reads this metafield at runtime.
 */
export async function syncMetafield(shop, graphql) {
  const milestones = await prisma.giftMilestone.findMany({
    where: { shop, isActive: true },
    orderBy: { thresholdAmount: "asc" },
  });

  const rulesJson = JSON.stringify(
    milestones.map((m) => ({
      thresholdAmount: m.thresholdAmount,
      giftVariantId: m.giftVariantId,
    })),
  );

  const response = await graphql(
    `#graphql
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            namespace: "$app:gift_milestones",
            key: "rules",
            type: "json",
            value: rulesJson,
            ownerId: `gid://shopify/Shop`,
          },
        ],
      },
    },
  );

  const { data } = await response.json();
  if (data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("Metafield sync errors:", data.metafieldsSet.userErrors);
    throw new Error("Failed to sync milestone rules to metafield");
  }

  return data;
}
