import { useEffect, useRef } from "react";
import type { LandmarkPoint } from "../types";

interface PoseCanvasProps {
  /** 鼻尖、双眼、双耳共 5 个头部关键点（归一化坐标 [0,1]）。 */
  landmarks: LandmarkPoint[];
  /** 仅绘制 score ≥ 此阈值的关键点与连线。 */
  minScore?: number;
}

/// 产品预览只呈现头部证据，身体关键点不绘制也不参与识别。
const SKELETON: ReadonlyArray<readonly [number, number]> = [
  [0, 1], // nose → left_eye
  [0, 2], // nose → right_eye
  [1, 3], // left_eye → left_ear
  [2, 4], // right_eye → right_ear
];

const POINT_RADIUS = 4;
const LINE_WIDTH = 2.5;
const SCORE_THRESHOLD = 0.3;

/**
 * 在摄像头预览上叠加姿态骨架的 canvas 覆盖层。
 *
 * 关键点坐标为归一化 [0,1]，canvas 尺寸通过 ResizeObserver
 * 自动适配父容器，绘制时乘以实际像素宽高。
 *
 * 父容器需 `position: relative` 并设置与 `<img>` 相同的尺寸。
 */
export function PoseCanvas({ landmarks, minScore = SCORE_THRESHOLD }: PoseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 使用 ResizeObserver 自动适配父容器尺寸。
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw(canvas, landmarks, minScore, dpr);
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [landmarks, minScore]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[2] size-full"
      aria-hidden="true"
    />
  );
}

/// 在 canvas 上绘制骨架连线 + 关键点圆圈。
function draw(
  canvas: HTMLCanvasElement,
  landmarks: LandmarkPoint[],
  minScore: number,
  dpr: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (landmarks.length === 0) return;

  // 缩放到 device pixel，所有坐标乘以 dpr。
  const px = (x: number) => x * w;
  const py = (y: number) => y * h;

  const get = (i: number): LandmarkPoint | undefined =>
    i < landmarks.length ? landmarks[i] : undefined;
  const ok = (p: LandmarkPoint | undefined): p is LandmarkPoint =>
    p !== undefined && p.score >= minScore;

  // ── 骨架连线 ──
  ctx.lineWidth = LINE_WIDTH * dpr;
  ctx.strokeStyle = "rgba(79, 176, 109, 0.85)";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of SKELETON) {
    const pa = get(a);
    const pb = get(b);
    if (!ok(pa) || !ok(pb)) continue;
    ctx.moveTo(px(pa.x), py(pa.y));
    ctx.lineTo(px(pb.x), py(pb.y));
  }
  ctx.stroke();

  // ── 关键点圆圈 ──
  for (const kp of landmarks.slice(0, 5)) {
    if (kp.score < minScore) continue;
    const x = px(kp.x);
    const y = py(kp.y);
    // 外圈（半透明光晕）
    ctx.beginPath();
    ctx.arc(x, y, (POINT_RADIUS + 2) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(79, 176, 109, 0.25)";
    ctx.fill();
    // 内圈（实心点）
    ctx.beginPath();
    ctx.arc(x, y, POINT_RADIUS * dpr, 0, Math.PI * 2);
    ctx.fillStyle = "#4fb06d";
    ctx.fill();
    // 白色描边
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
  }
}
