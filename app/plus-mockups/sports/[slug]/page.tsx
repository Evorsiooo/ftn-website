import { LeaguePage } from "../../_ui/more";

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ slug: "harrison-grand-touring-championship" }, { slug: "harrison-rallying-championship" }];
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <LeaguePage slug={slug} />;
}
