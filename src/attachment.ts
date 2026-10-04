import type { Message } from "grammy/types";
import type { Attachment, AttachmentKind } from "./store.js";

type MediaFilter =
  | "message:photo"
  | "message:video"
  | "message:document"
  | "message:audio"
  | "message:voice"
  | "message:location";

export const MEDIA_FILTERS: MediaFilter[] = [
  "message:photo",
  "message:video",
  "message:document",
  "message:audio",
  "message:voice",
  "message:location",
];

export const ICONS: Record<AttachmentKind, string> = {
  photo: "📷",
  video: "🎬",
  document: "📎",
  audio: "🎵",
  voice: "🎤",
  location: "📍",
};

/** Pulls the supported attachment (if any) out of a Telegram message. */
export function extractAttachment(msg: Message): Attachment | undefined {
  if (msg.photo?.length) {
    // Telegram lists several sizes; the last is the largest.
    return { kind: "photo", fileId: msg.photo[msg.photo.length - 1]!.file_id };
  }
  if (msg.video) return { kind: "video", fileId: msg.video.file_id, name: msg.video.file_name };
  if (msg.document) return { kind: "document", fileId: msg.document.file_id, name: msg.document.file_name };
  if (msg.audio) {
    return { kind: "audio", fileId: msg.audio.file_id, name: msg.audio.title ?? msg.audio.file_name };
  }
  if (msg.voice) return { kind: "voice", fileId: msg.voice.file_id };
  if (msg.location) {
    return { kind: "location", latitude: msg.location.latitude, longitude: msg.location.longitude };
  }
  return undefined;
}
