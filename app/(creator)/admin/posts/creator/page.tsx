"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PostCreator } from "@/components/admin/posts/post-creator";

function CreatorFromAddress() {
  const edit = useSearchParams().get("edit");
  return <PostCreator editId={edit} />;
}

export default function CreatorPage() {
  return (
    <Suspense fallback={<div className="gs flex min-h-dvh items-center justify-center text-sm text-neutral-500">Loading the creator...</div>}>
      <CreatorFromAddress />
    </Suspense>
  );
}
