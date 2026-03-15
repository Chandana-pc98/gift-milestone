import { redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const params = url.searchParams.toString();
  return redirect(`/app${params ? `?${params}` : ""}`);
};
