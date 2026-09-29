import { GRADE_LABEL, GRADE_TONE, type Grade } from "@/lib/analysis/quality";

/** The setup kind's replayed record as a small label: positive, mixed, negative or little history. */
export function GradeChip({ grade, avgR }: { grade: Grade | null | undefined; avgR?: number | null }) {
  if (!grade) return <span className="text-[12px] text-fg-3">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]" style={{ color: GRADE_TONE[grade] }}
      title={`${GRADE_LABEL[grade]}${avgR != null ? `: ${avgR >= 0 ? "+" : "−"}${Math.abs(avgR).toFixed(2)}R average across replayed cases of this kind` : ""}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: GRADE_TONE[grade] }} />
      {GRADE_LABEL[grade]}
    </span>
  );
}
