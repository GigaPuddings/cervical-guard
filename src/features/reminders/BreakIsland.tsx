import { Check, Coffee } from "lucide-react";
import type { AppSnapshot } from "../../types";
import { formatDuration } from "../../utils";

export function BreakIsland({ snapshot, onEnd }: { snapshot: AppSnapshot; onEnd: () => void }) {
  const timeUp = snapshot.breakRemainingSeconds === 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-4" role="presentation">
      <section className="pointer-events-auto grid h-[76px] w-full max-w-[360px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[22px] bg-panel-strong px-2.5 text-inverse shadow-panel" role="dialog" aria-modal="false" aria-labelledby="break-island-title">
        <span className="grid size-8 place-items-center rounded-[11px] bg-info text-inverse" aria-hidden="true">
          {timeUp ? <Check size={16} /> : <Coffee size={16} />}
        </span>
        <span className="min-w-0">
          <small className="block truncate text-[8px] font-semibold text-inverse-muted">
            {timeUp ? "休息时间到" : `休息剩余 ${formatDuration(snapshot.breakRemainingSeconds)}`}
          </small>
          <strong className="mt-0.5 block truncate text-xs" id="break-island-title">
            {timeUp ? "准备好了就继续吧" : "起来走动，放松一下肩颈"}
          </strong>
        </span>
        <button className="h-7 rounded-[9px] bg-break-soft px-2.5 text-[8px] font-bold text-break hover:bg-inverse" onClick={onEnd}>
          {timeUp ? "完成休息" : "结束休息"}
        </button>
      </section>
    </div>
  );
}
