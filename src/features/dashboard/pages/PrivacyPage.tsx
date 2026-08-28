import { CameraOff, Download, Eye, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react'
import { languageOf } from '../../../i18n'
import { defineMessages, localizeMessages } from '../../../runtimeI18n'
import type { AppSnapshot } from '../../../types'

const privacyMessages = defineMessages({
  eyebrow: { zh: '隐私与设备', en: 'Privacy & devices' },
  title: { zh: '本地处理，数据由你掌控', en: 'Local processing. Your data stays yours.' },
  subtitle: { zh: '这里说明摄像头和本地统计的边界；检测参数请前往偏好设置。', en: 'Review camera and local-statistics boundaries here; detection options are in Preferences.' },
  rawFrames: { zh: '原始画面不落盘', en: 'Raw frames are never stored' },
  storageDescription: { zh: '姿态模型在本机内存中处理画面，数据库只保存结构化行为事件、每日汇总和设置。', en: 'The posture model processes frames in local memory. Only structured events, daily totals, and settings are stored.' },
  noIdentity: { zh: '不进行身份识别', en: 'No identity recognition' },
  noMedia: { zh: '不保存视频或截图', en: 'No video or screenshots are saved' },
  noUpload: { zh: '不上传摄像头数据', en: 'Camera data is not uploaded' },
  currentDevice: { zh: '当前设备', en: 'Current device' },
  cameraMode: { zh: '摄像头本地检测', en: 'Local camera detection' },
  timerMode: { zh: '普通定时模式', en: 'Timer mode' },
  devicePrefix: { zh: '设备：', en: 'Device: ' },
  defaultCamera: { zh: '默认摄像头', en: 'Default camera' },
  calibrationSuffix: { zh: '。校准信息只保存一个数值基线。', en: '. Calibration stores only a numeric baseline.' },
  timerDescription: { zh: '当前不会读取摄像头，只根据启用时间提供久坐提醒。', en: 'The camera is not being read. Sitting reminders use elapsed time only.' },
  export: { zh: '导出本地 CSV', en: 'Export local CSV' },
  delete: { zh: '删除全部统计和行为历史', en: 'Delete statistics and behavior history' }
})

const settingsPanelClass = 'rounded-[18px] border border-edge bg-panel p-6 shadow-panel'
const eyebrowClass = 'text-xs font-extrabold tracking-[.14em] text-accent'

export function PrivacyPage({ snapshot, onExport, onDeleteData }: { snapshot: AppSnapshot; onExport: () => void; onDeleteData: () => void }) {
  const messages = localizeMessages(privacyMessages, languageOf(snapshot.settings.language))
  return (
    <div className="mx-auto max-w-260 px-[clamp(20px,4vw,54px)] py-8">
      <span className={eyebrowClass}>{messages.eyebrow}</span>
      <h1 className="mb-2 mt-2 text-[31px] font-black tracking-[-.035em]">{messages.title}</h1>
      <p className="text-[13px] text-muted">{messages.subtitle}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className={settingsPanelClass}>
          <div className="mb-4 grid size-13 place-items-center rounded-2xl bg-accent-soft text-accent">
            <ShieldCheck size={28} />
          </div>
          <h2 className="text-lg font-bold">{messages.rawFrames}</h2>
          <p className="mt-2 text-[10px] leading-5 text-muted">{messages.storageDescription}</p>
          <ul className="mt-5 grid list-none gap-3 p-0 text-[10px] text-muted">
            <li className="flex gap-2">
              <Eye size={15} className="text-accent" />
              {messages.noIdentity}
            </li>
            <li className="flex gap-2">
              <CameraOff size={15} className="text-accent" />
              {messages.noMedia}
            </li>
            <li className="flex gap-2">
              <LockKeyhole size={15} className="text-accent" />
              {messages.noUpload}
            </li>
          </ul>
        </section>
        <section className={settingsPanelClass}>
          <span className={eyebrowClass}>{messages.currentDevice}</span>
          <h2 className="mt-2 text-lg font-bold">{snapshot.monitoringMode === 'camera' ? messages.cameraMode : messages.timerMode}</h2>
          <p className="mt-2 text-[10px] leading-5 text-muted">{snapshot.monitoringMode === 'camera' ? `${messages.devicePrefix}${snapshot.settings.cameraId || messages.defaultCamera}${messages.calibrationSuffix}` : messages.timerDescription}</p>
          <div className="mt-5 grid gap-2">
            <button className="inline-flex min-h-10.5 items-center justify-center gap-2 rounded-xl border border-edge text-[11px] font-bold text-muted hover:bg-panel-muted" onClick={onExport}>
              <Download size={17} />
              {messages.export}
            </button>
            <button className="inline-flex min-h-10.5 items-center justify-center gap-2 rounded-xl text-[11px] font-bold text-danger hover:bg-danger-soft" onClick={onDeleteData}>
              <Trash2 size={17} />
              {messages.delete}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
