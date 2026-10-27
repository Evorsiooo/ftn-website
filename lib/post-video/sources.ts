import { ALL_FORMATS, BlobSource, Input, type InputAudioTrack, type InputVideoTrack } from "mediabunny";
import type { SourceInfo } from "./model";
import { newId } from "./model";

/** A file the staff member imported, opened for reading frames and sound. */
export interface LoadedSource {
  info: SourceInfo;
  file: Blob;
  input: Input;
  videoTrack: InputVideoTrack | null;
  audioTrack: InputAudioTrack | null;
  /** Object URL for the preview players. */
  objectUrl: string;
}

export async function loadSource(file: Blob, name: string, kind: "video" | "music", url: string | null, id = newId()): Promise<LoadedSource> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let videoTrack: InputVideoTrack | null = null;
  let audioTrack: InputAudioTrack | null = null;
  try {
    if (kind === "video") {
      videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error("This file has no video.");
      if (!(await videoTrack.canDecode())) {
        throw new Error(
          "This browser cannot read the video in this file (iPhone and some camera videos use HEVC). Use Chrome or Edge, or convert the video to H.264 first."
        );
      }
    }
    audioTrack = await input.getPrimaryAudioTrack();
    if (kind === "music") {
      if (!audioTrack) throw new Error("This file has no sound.");
      if (!(await audioTrack.canDecode())) throw new Error("This browser cannot read the sound in this file.");
    }
    if (audioTrack && kind === "video" && !(await audioTrack.canDecode())) audioTrack = null;

    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read the length of this file.");
    return {
      info: {
        id,
        kind,
        name,
        duration,
        width: videoTrack?.displayWidth ?? 0,
        height: videoTrack?.displayHeight ?? 0,
        hasAudio: !!audioTrack,
        url,
      },
      file,
      input,
      videoTrack,
      audioTrack,
      objectUrl: URL.createObjectURL(file),
    };
  } catch (err) {
    input.dispose();
    throw err;
  }
}

export function disposeSource(source: LoadedSource) {
  URL.revokeObjectURL(source.objectUrl);
  source.input.dispose();
}
