"use client";
// Home's radio row: what's on air, with Listen. Nothing else, as in the approved mockup.
import Link from "next/link";
import { useOnAir } from "@/components/radio/use-on-air";
import { useNowPlaying } from "@/components/radio/use-now-playing";
import { useSiteConfig } from "@/lib/site-config-context";
import { ListenButton } from "./radio-controls";

export function RadioRow() {
  const { webradioEnabled } = useSiteConfig();
  const onAir = useOnAir(webradioEnabled);
  // the schedule's show (and an OBS show's details) come from the now-playing poll
  const { info } = useNowPlaying(30_000, webradioEnabled);
  if (!webradioEnabled || onAir.state === "loading") return null;

  const show = info?.currentShow;
  let title: string;
  let sub: string | null;
  let art: string | null = null;
  if (onAir.state === "off-air") {
    title = "Off air";
    sub = info?.nextShow ? `Back with ${info.nextShow.name}` : null;
  } else if (onAir.state === "icecast") {
    title = show?.name ?? info?.track?.title ?? "On air";
    sub = show ? (show.presenter ? `with ${show.presenter}` : null) : info?.track?.artist ?? null;
    art = show?.artUrl ?? info?.artUrl ?? null;
  } else {
    title = onAir.title;
    sub = onAir.artist;
    art = onAir.art;
  }
  return (
    <>
      <div className="rowh">
        <h2 className="h2">Radio</h2>
      </div>
      <div className="rblock">
        {art && <img src={art} alt="" />}
        <Link href="/plus/radio" className="grow">
          <div className="t">{title}</div>
          {sub && <div className="s">{sub}</div>}
        </Link>
        {onAir.state !== "off-air" && <ListenButton big={false} />}
      </div>
    </>
  );
}
