export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5" aria-label="健康提醒">
      <span className="grid size-10 place-items-center rounded-[13px] bg-[linear-gradient(145deg,#43845a,#285f3e)] text-inverse shadow-control">
        <svg aria-hidden="true" viewBox="0 0 64 64" className="size-7" fill="none">
          <path d="M31 53C27 46 27 40 31 34C38 24 38 17 32 10" stroke="#F7FAF5" strokeWidth="5.4" strokeLinecap="round" />
          <path d="M35 22C38.5 15.5 44.5 12.5 51.5 13.5C48.5 20 43 23 35 22Z" fill="#E4EFDF" />
          <path d="M32 34C24.5 34.5 19.5 30.5 17 24C24.5 23.5 30 27 32 34Z" fill="#A9CAA8" />
          <path d="M36.5 21C40.5 19 44 17.2 48.5 15.2M30.5 32.5C26.5 29.8 23.5 27.9 19.5 26" stroke="#F7FAF5" strokeOpacity=".46" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <strong className="text-base tracking-[.12em]">健康提醒</strong>
          <small className="mt-1.5 text-[8px] tracking-[.2em] text-muted">姿态与久坐</small>
        </span>
      )}
    </div>
  );
}
