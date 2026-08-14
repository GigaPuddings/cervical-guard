import { CameraOff, Download, Eye, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'
import type { AppSnapshot } from '../../../types'

const settingsPanelClass = 'rounded-[18px] border border-edge bg-panel p-6 shadow-panel'
const eyebrowClass = 'text-xs font-extrabold tracking-[.14em] text-accent'

export function PrivacyPage({ snapshot, onExport, onDeleteData }: { snapshot: AppSnapshot; onExport: () => void; onDeleteData: () => void }) {
  return (
    <div className="mx-auto max-w-260 px-[clamp(20px,4vw,54px)] py-8">
      <span className={eyebrowClass}>隐私与设备</span>
      <h1 className="mb-2 mt-2 text-[31px] font-black tracking-[-.035em]">本地处理，数据由你掌控</h1>
      <p className="text-[13px] text-muted">这里说明摄像头和本地统计的边界；检测参数请前往偏好设置。</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className={settingsPanelClass}>
          <div className="mb-4 grid size-13 place-items-center rounded-2xl bg-accent-soft text-accent">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-lg font-bold">原始画面不落盘</h2>
          <p className="mt-2 text-[10px] leading-5 text-muted">姿态模型在本机内存中处理画面，数据库只保存结构化行为事件、每日汇总和设置。</p>
          <ul className="mt-5 grid list-none gap-3 p-0 text-[10px] text-muted">
            <li className="flex gap-2">
              <Eye size={15} className="text-accent" />
              不进行身份识别
            </li>
            <li className="flex gap-2">
              <CameraOff size={15} className="text-accent" />
              不保存视频或截图
            </li>
            <li className="flex gap-2">
              <LockKeyhole size={15} className="text-accent" />
              不上传摄像头数据
            </li>
          </ul>
        </section>
        <section className={settingsPanelClass}>
          <span className={eyebrowClass}>当前设备</span>
          <h2 className="mt-2 text-lg font-bold">{snapshot.monitoringMode === 'camera' ? '摄像头本地检测' : '普通定时模式'}</h2>
          <p className="mt-2 text-[10px] leading-5 text-muted">{snapshot.monitoringMode === 'camera' ? `设备：${snapshot.settings.cameraId || '默认摄像头'}。校准信息只保存一个数值基线。` : '当前不会读取摄像头，只根据启用时间提供久坐提醒。'}</p>
          <div className="mt-5 grid gap-2">
            <button className="inline-flex min-h-10.5 items-center justify-center gap-2 rounded-xl border border-edge text-[11px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}>
              <Download size={17} />
              导出本地 CSV
            </button>
            <button className="inline-flex min-h-10.5 items-center justify-center gap-2 rounded-xl text-[11px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}>
              <Trash2 size={17} />
              删除全部统计和行为历史
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
