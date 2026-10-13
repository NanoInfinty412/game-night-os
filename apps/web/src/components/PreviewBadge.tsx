/** Marks screens that still use sample data. Removed once rooms are real (milestone 2). */
export function PreviewBadge() {
  return (
    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/60">
      Preview · sample data
    </span>
  );
}
