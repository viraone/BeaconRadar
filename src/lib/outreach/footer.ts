import { EMAIL_FOOTER_TEMPLATE, FOOTER_DELIMITER } from "@/config/outreach";

export type SenderInfo = { senderName: string | null; senderCompany: string | null; senderPostalAddress: string | null };

export function senderIsComplete(s: SenderInfo): boolean {
  return Boolean(s.senderName?.trim() && s.senderCompany?.trim() && s.senderPostalAddress?.trim());
}

/** The CAN-SPAM footer: identity, postal address, opt-out. Throws if the sender info is incomplete. */
export function buildFooter(s: SenderInfo): string {
  if (!senderIsComplete(s)) throw new Error("Sender name, company and postal address must be set before drafting.");
  return EMAIL_FOOTER_TEMPLATE.replace("{{name}}", s.senderName!.trim())
    .replace("{{company}}", s.senderCompany!.trim())
    .replace("{{address}}", s.senderPostalAddress!.trim().replace(/\s*\n\s*/g, ", "));
}

export function appendFooter(body: string, s: SenderInfo): string {
  return `${stripFooter(body).trimEnd()}\n\n${buildFooter(s)}`;
}

/** Message text without the footer (used for length and content checks). */
export function stripFooter(text: string): string {
  const idx = text.indexOf(`\n${FOOTER_DELIMITER}\n`);
  if (idx === -1) return text.startsWith(`${FOOTER_DELIMITER}\n`) ? "" : text;
  return text.slice(0, idx).trimEnd();
}

export function hasFooter(text: string): boolean {
  return /\n--\n[\s\S]*unsubscribe/i.test(text) && /\n--\n/.test(text);
}
