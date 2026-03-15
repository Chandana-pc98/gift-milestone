import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  Thumbnail,
  EmptyState,
  InlineStack,
  Button,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import { getMilestones, deleteMilestone } from "../models/GiftMilestone.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const milestones = await getMilestones(session.shop);
  return json({ milestones });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const id = formData.get("id");
    await deleteMilestone(id, session.shop, admin.graphql);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function MilestonesIndex() {
  const { milestones } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();

  const handleDelete = (id) => {
    const formData = new FormData();
    formData.append("intent", "delete");
    formData.append("id", id);
    submit(formData, { method: "post" });
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);

  const emptyState = (
    <EmptyState
      heading="Create your first gift milestone"
      action={{
        content: "Create milestone",
        onAction: () => navigate("/app/milestones/new"),
      }}
      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
    >
      <p>
        Set up cart value thresholds to automatically add free gift products
        when customers reach spending milestones.
      </p>
    </EmptyState>
  );

  const resourceName = {
    singular: "milestone",
    plural: "milestones",
  };

  const rowMarkup = milestones.map((milestone, index) => (
    <IndexTable.Row
      id={milestone.id}
      key={milestone.id}
      position={index}
      onClick={() => navigate(`/app/milestones/${milestone.id}`)}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="bold">
          {milestone.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {formatCurrency(milestone.thresholdAmount)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <Thumbnail
            source={milestone.giftProductImage || ImageIcon}
            alt={milestone.giftProductTitle}
            size="small"
          />
          <Text variant="bodyMd">{milestone.giftProductTitle}</Text>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone={milestone.isActive ? "success" : undefined}>
          {milestone.isActive ? "Active" : "Inactive"}
        </Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Button
          variant="plain"
          tone="critical"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(milestone.id);
          }}
        >
          Delete
        </Button>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Gift Milestones"
      primaryAction={{
        content: "Create milestone",
        onAction: () => navigate("/app/milestones/new"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {milestones.length === 0 ? (
              emptyState
            ) : (
              <IndexTable
                resourceName={resourceName}
                itemCount={milestones.length}
                headings={[
                  { title: "Name" },
                  { title: "Threshold" },
                  { title: "Gift Product" },
                  { title: "Status" },
                  { title: "Actions" },
                ]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
