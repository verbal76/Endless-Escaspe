// Pure mailto: composition for bug reports (util/support.ts gathers
// the live data). Mail apps truncate or refuse long mailto: URLs (a few
// KB is the safe range on Android), and log entries can hold whole JS
// stacks, so the URL is held to a budget: every entry is clipped, then
// the OLDEST log entries are dropped (previous run first, it is older
// than the current one) until the URL fits. The diagnostic block is
// always kept in full.

export const MAILTO_MAX_LENGTH = 6000;
export const LOG_ENTRY_MAX_CHARS = 300;

export type LogSection = {
  // e.g. "previous run (pre-crash)"
  title: string;
  // Oldest first.
  entries: string[];
  // Shown when the section has no entries at all.
  empty: string;
};

export type MailtoReport = {
  to: string;
  subject: string;
  // Lines that are always kept: the prompt and the diagnostics.
  head: string[];
  // Oldest section first.
  sections: LogSection[];
  maxLength?: number;
  maxEntryChars?: number;
};

export function clipEntry(entry: string, max = LOG_ENTRY_MAX_CHARS): string {
  return entry.length <= max ? entry : `${entry.slice(0, max - 1)}…`;
}

function sectionText(s: LogSection, kept: string[]): string[] {
  const dropped = s.entries.length - kept.length;
  const count =
    s.entries.length === 0 ? '' : dropped > 0 ? `, last ${kept.length} of ${s.entries.length} entries` : `, ${kept.length} entries`;
  return ['', `--- ${s.title}${count} ---`, ...(s.entries.length === 0 ? [s.empty] : kept.length ? kept : ['(omitted: report size limit)'])];
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function composeMailtoReport(r: MailtoReport): string {
  const max = r.maxLength ?? MAILTO_MAX_LENGTH;
  const clipped = r.sections.map((s) => s.entries.map((e) => clipEntry(e, r.maxEntryChars)));
  // Index of the first kept entry in each section.
  const start = clipped.map(() => 0);
  const build = () =>
    mailtoUrl(
      r.to,
      r.subject,
      [...r.head, ...r.sections.flatMap((s, i) => sectionText(s, clipped[i].slice(start[i])))].join('\n'),
    );
  let url = build();
  for (let i = 0; i < clipped.length && url.length > max; i++) {
    while (start[i] < clipped[i].length && url.length > max) {
      start[i]++;
      url = build();
    }
  }
  return url;
}
