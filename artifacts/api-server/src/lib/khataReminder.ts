export function formatKhataReminderDateLabel(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Polite Videh-branded reminder (delivered via scheduled job; bypasses block). */
export function buildKhataReminderMessage(opts: {
  debtorName: string;
  creditorName: string;
  amount: number;
  note?: string | null;
  reminderDateLabel: string;
}): string {
  const noteLine = opts.note?.trim() ? `\n\nNote: ${opts.note.trim()}` : "";
  return (
    `Namaste ${opts.debtorName},\n\n` +
    `This is a gentle reminder from Videh Khata.\n\n` +
    `${opts.creditorName} has recorded that you owe ₹${opts.amount.toFixed(2)}.${noteLine}\n\n` +
    `Reminder date: ${opts.reminderDateLabel}\n\n` +
    `Whenever convenient, please settle this amount. Thank you for keeping trust clear.\n\n` +
    `With care,\nVideh`
  );
}
