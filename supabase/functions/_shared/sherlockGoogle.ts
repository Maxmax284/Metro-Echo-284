// sherlockGoogle — Gmail and Drive as ground under a Sherlock read.
//
// Doctrine:
//   - Reading only. Nothing here drafts, sends, labels, moves or opens a file's
//     contents. Mail is headers; Drive is names and dates.
//   - Only this person's own Google connection is used. A missing connection is
//     reported as a missing connection, never as an empty inbox.
//   - A read that costs a provider call happens because a person asked a
//     question, not on a timer.
import { callGoogle } from "./googleService.ts";
import { GOOGLE_DRIVE_CONNECTOR_ID, GOOGLE_MAIL_CONNECTOR_ID } from "./appUserScopes.ts";
import { MAIL_QUERY, mailSearchQuery, toMailItem, type MailItem } from "./mailRead.ts";
import { driveKindLabel, driveQuery } from "./driveRead.ts";
import { whenLine } from "./sherlockGround.ts";
import {
  driveContextLine,
  mailContextLine,
  outsideNote,
  outsideTerm,
  type OutsideFile,
  type OutsideStatus,
} from "./sherlockOutside.ts";

const MAIL_MAX = 6;
const FILE_MAX = 8;

function statusFrom(reason: string | undefined): OutsideStatus {
  if (reason === "not_connected") return "not_connected";
  /* A switched-off Google service also needs this person, just somewhere else. */
  if (reason === "needs_you" || reason === "service_off") return "needs_you";
  return "failed";
}

export type OutsideGround = {
  lines: string[];
  mail: OutsideStatus;
  drive: OutsideStatus;
  mailCount: number;
  fileCount: number;
};

/**
 * Mail headers and file names around a question, as plain context lines.
 * `question` narrows both searches; an empty question reads what is waiting.
 */
export async function outsideGround(
  userId: string,
  question: string,
  timezone: string,
): Promise<OutsideGround> {
  const [mail, drive] = await Promise.all([
    readMail(userId, question, timezone),
    readFiles(userId, question, timezone),
  ]);

  const lines: string[] = [...mail.lines, ...drive.lines];
  const mailNote = outsideNote("Gmail", mail.status);
  if (mailNote) lines.push(mailNote);
  const driveNote = outsideNote("Drive", drive.status);
  if (driveNote) lines.push(driveNote);

  return {
    lines,
    mail: mail.status,
    drive: drive.status,
    mailCount: mail.lines.length,
    fileCount: drive.lines.length,
  };
}

async function readMail(
  userId: string,
  question: string,
  timezone: string,
): Promise<{ lines: string[]; status: OutsideStatus }> {
  const q = question ? mailSearchQuery(question) : MAIL_QUERY;
  const list = await callGoogle(
    userId,
    GOOGLE_MAIL_CONNECTOR_ID,
    `/gmail/v1/users/me/messages?maxResults=${MAIL_MAX}&q=${encodeURIComponent(q)}`,
  );
  if (!list.ok) return { lines: [], status: statusFrom(list.reason) };

  const ids = (((list.body as { messages?: { id?: string }[] } | null)?.messages) ?? [])
    .map((m) => String(m.id ?? ""))
    .filter(Boolean)
    .slice(0, MAIL_MAX);

  const lines: string[] = [];
  for (const id of ids) {
    const one = await callGoogle(
      userId,
      GOOGLE_MAIL_CONNECTOR_ID,
      `/gmail/v1/users/me/messages/${id}?format=metadata`
        + "&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
    );
    if (!one.ok) continue;
    const item: MailItem = toMailItem(one.body as never);
    lines.push(mailContextLine(item, whenLine(item.date, timezone)));
  }
  return { lines, status: "read" };
}

async function readFiles(
  userId: string,
  question: string,
  timezone: string,
): Promise<{ lines: string[]; status: OutsideStatus }> {
  const params = new URLSearchParams({
    q: driveQuery(outsideTerm(question)),
    pageSize: String(FILE_MAX),
    orderBy: "modifiedTime desc",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
  });
  const res = await callGoogle(userId, GOOGLE_DRIVE_CONNECTOR_ID, `/drive/v3/files?${params.toString()}`);
  if (!res.ok) return { lines: [], status: statusFrom(res.reason) };

  const files: OutsideFile[] = (((res.body as { files?: unknown[] } | null)?.files) ?? []).map((f) => {
    const file = f as {
      id?: string;
      name?: string;
      mimeType?: string;
      modifiedTime?: string;
      webViewLink?: string;
    };
    return {
      id: String(file.id ?? ""),
      name: String(file.name ?? "Untitled"),
      kind: driveKindLabel(file.mimeType ?? ""),
      modifiedAt: file.modifiedTime ?? null,
      link: file.webViewLink ?? null,
    };
  });

  return {
    lines: files.map((f) => driveContextLine(f, whenLine(f.modifiedAt, timezone))),
    status: "read",
  };
}
