import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigate, useSubmit, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Checkbox,
  BlockStack,
  InlineStack,
  Thumbnail,
  Text,
  Banner,
  PageActions,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import {
  getMilestone,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} from "../models/GiftMilestone.server.js";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  if (id === "new") {
    return json({
      milestone: {
        name: "",
        thresholdAmount: "",
        giftProductId: "",
        giftVariantId: "",
        giftProductTitle: "",
        giftProductImage: "",
        isActive: true,
      },
      isNew: true,
    });
  }

  const milestone = await getMilestone(id, session.shop);
  if (!milestone) {
    throw new Response("Not found", { status: 404 });
  }

  return json({ milestone, isNew: false });
};

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete" && id !== "new") {
    await deleteMilestone(id, session.shop, admin.graphql);
    return redirect("/app");
  }

  const name = formData.get("name");
  const thresholdAmount = parseFloat(formData.get("thresholdAmount"));
  const giftProductId = formData.get("giftProductId");
  const giftVariantId = formData.get("giftVariantId");
  const giftProductTitle = formData.get("giftProductTitle");
  const giftProductImage = formData.get("giftProductImage") || "";
  const isActive = formData.get("isActive") === "true";

  // Validation
  const errors = {};
  if (!name || name.trim() === "") errors.name = "Name is required";
  if (!thresholdAmount || thresholdAmount <= 0)
    errors.thresholdAmount = "Threshold must be greater than 0";
  if (!giftProductId) errors.giftProductId = "Please select a gift product";

  if (Object.keys(errors).length > 0) {
    return json({ errors }, { status: 422 });
  }

  const data = {
    name: name.trim(),
    thresholdAmount,
    giftProductId,
    giftVariantId,
    giftProductTitle,
    giftProductImage,
    isActive,
  };

  if (id === "new") {
    await createMilestone(session.shop, data, admin.graphql);
  } else {
    await updateMilestone(id, session.shop, data, admin.graphql);
  }

  return redirect("/app");
};

export default function MilestoneEditor() {
  const { milestone, isNew } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [formState, setFormState] = useState({
    name: milestone.name || "",
    thresholdAmount: milestone.thresholdAmount?.toString() || "",
    giftProductId: milestone.giftProductId || "",
    giftVariantId: milestone.giftVariantId || "",
    giftProductTitle: milestone.giftProductTitle || "",
    giftProductImage: milestone.giftProductImage || "",
    isActive: milestone.isActive ?? true,
  });

  const handleChange = useCallback((field) => (value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleProductPicker = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      filter: { variants: true },
      selectionIds: formState.giftProductId
        ? [{ id: formState.giftProductId }]
        : [],
    });

    if (selected && selected.length > 0) {
      const product = selected[0];
      const variant = product.variants[0];
      setFormState((prev) => ({
        ...prev,
        giftProductId: product.id,
        giftVariantId: variant.id,
        giftProductTitle: product.title,
        giftProductImage: product.images?.[0]?.originalSrc || "",
      }));
    }
  }, [formState.giftProductId]);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("intent", "save");
    formData.append("name", formState.name);
    formData.append("thresholdAmount", formState.thresholdAmount);
    formData.append("giftProductId", formState.giftProductId);
    formData.append("giftVariantId", formState.giftVariantId);
    formData.append("giftProductTitle", formState.giftProductTitle);
    formData.append("giftProductImage", formState.giftProductImage);
    formData.append("isActive", formState.isActive.toString());
    submit(formData, { method: "post" });
  };

  const handleDelete = () => {
    const formData = new FormData();
    formData.append("intent", "delete");
    submit(formData, { method: "post" });
  };

  const errors = actionData?.errors || {};

  return (
    <Page
      backAction={{ onAction: () => navigate("/app") }}
      title={isNew ? "Create gift milestone" : `Edit: ${milestone.name}`}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {Object.keys(errors).length > 0 && (
              <Banner tone="critical">
                <p>Please fix the errors below.</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Rule details</Text>
                <FormLayout>
                  <TextField
                    label="Rule name"
                    value={formState.name}
                    onChange={handleChange("name")}
                    error={errors.name}
                    placeholder="e.g., Spend $100 Free Gift"
                    autoComplete="off"
                  />
                  <TextField
                    label="Minimum cart value"
                    type="number"
                    prefix="$"
                    value={formState.thresholdAmount}
                    onChange={handleChange("thresholdAmount")}
                    error={errors.thresholdAmount}
                    placeholder="100.00"
                    autoComplete="off"
                    min={0}
                    step={0.01}
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd">Gift product</Text>
                {formState.giftProductId ? (
                  <InlineStack gap="400" blockAlign="center">
                    <Thumbnail
                      source={formState.giftProductImage || ImageIcon}
                      alt={formState.giftProductTitle}
                      size="medium"
                    />
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="bold">
                        {formState.giftProductTitle}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Variant: {formState.giftVariantId.split("/").pop()}
                      </Text>
                    </BlockStack>
                    <Button onClick={handleProductPicker}>Change product</Button>
                  </InlineStack>
                ) : (
                  <BlockStack gap="200">
                    {errors.giftProductId && (
                      <Text tone="critical">{errors.giftProductId}</Text>
                    )}
                    <Button onClick={handleProductPicker} variant="primary">
                      Select gift product
                    </Button>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            <Card>
              <Checkbox
                label="Active"
                helpText="When active, this gift will be automatically added to qualifying carts."
                checked={formState.isActive}
                onChange={handleChange("isActive")}
              />
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd">How it works</Text>
              <Text variant="bodyMd">
                When a customer's cart total reaches the minimum value you set,
                the gift product is automatically added to their cart for free.
              </Text>
              <Text variant="bodyMd">
                If the customer removes items and drops below the threshold, the
                gift will be removed automatically.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <PageActions
        primaryAction={{
          content: "Save",
          onAction: handleSave,
          loading: isSaving,
        }}
        secondaryActions={
          isNew
            ? [{ content: "Cancel", onAction: () => navigate("/app") }]
            : [
                { content: "Cancel", onAction: () => navigate("/app") },
                {
                  content: "Delete",
                  destructive: true,
                  onAction: handleDelete,
                },
              ]
        }
      />
    </Page>
  );
}
