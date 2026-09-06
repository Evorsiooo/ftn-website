import { DbClient } from "@/db";

export interface LiveStreamStatus {
  isLive: boolean;
  streamUrl: string;
  currentShow: string;
  presenter: string;
  listenersCount: number;
  genre: string;
  bitrate: string;
}

export async function getLiveStreamStatus(db?: DbClient): Promise<LiveStreamStatus> {
  const defaultStatus: LiveStreamStatus = {
    isLive: true,
    streamUrl: "https://icecast.ftnmedia.org/live.mp3",
    currentShow: "The Night Wave: Electronic & Ambient Cityscapes",
    presenter: "DJ Nova (Broadcast Division)",
    listenersCount: 142,
    genre: "Electronic / Ambient",
    bitrate: "320 kbps",
  };

  return defaultStatus;
}
