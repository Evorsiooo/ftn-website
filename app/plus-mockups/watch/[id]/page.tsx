import { VIDEOS } from "../../_ui/data";
import { WatchPage } from "../../_ui/videos";

export const dynamicParams = false;
export function generateStaticParams() {
  return VIDEOS.map((v) => ({ id: v.id }));
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchPage id={id} />;
}
