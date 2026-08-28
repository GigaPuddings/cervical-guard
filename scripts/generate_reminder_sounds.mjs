// 生成随应用内置的三种提醒提示音(16-bit PCM WAV,44.1kHz 单声道)。
// 输出写入 src-tauri/assets/sounds/,由 sound.rs 以 include_bytes! 嵌入二进制。
// 运行:node scripts/generate_reminder_sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 44_100
const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'assets', 'sounds')

function encodeWav(samples) {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // 单声道
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataLength, 40)
  samples.forEach((value, index) => {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32_767), 44 + index * 2)
  })
  return buffer
}

/** 正弦音符:指数衰减包络 + 轻微泛音,结尾留 40ms 收尾避免爆音。 */
function tone(startSeconds, durationSeconds, frequency, gain, harmonics = 0.18) {
  return (timeSeconds) => {
    const local = timeSeconds - startSeconds
    if (local < 0 || local >= durationSeconds) return 0
    const attack = Math.min(1, local / 0.012)
    const decay = Math.exp(-local * 4.2)
    const tail = Math.min(1, (durationSeconds - local) / 0.04)
    const phase = 2 * Math.PI * frequency * local
    return gain * attack * decay * tail * (Math.sin(phase) + harmonics * Math.sin(phase * 2))
  }
}

function render(totalSeconds, layers) {
  const count = Math.round(totalSeconds * SAMPLE_RATE)
  const samples = new Array(count).fill(0)
  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE
    samples[index] = layers.reduce((sum, layer) => sum + layer(time), 0)
  }
  return samples
}

const sounds = {
  // 轻声单音:温和级别(Gentle),会议模式外的最低强度。
  'soft.wav': render(0.55, [
    tone(0, 0.5, 659.25, 0.42),
    tone(0, 0.5, 659.25 * 1.5, 0.08)
  ]),
  // 双音上行:常规提醒(Noticeable)。
  'chime.wav': render(0.85, [
    tone(0, 0.42, 659.25, 0.4),
    tone(0.18, 0.65, 880, 0.44),
    tone(0.18, 0.65, 880 * 2, 0.07)
  ]),
  // 三音急促:强化提醒(Strong),用于长时间低头或反复忽略后的强提示。
  'alert.wav': render(0.95, [
    tone(0, 0.2, 880, 0.4),
    tone(0.24, 0.2, 987.77, 0.44),
    tone(0.48, 0.45, 1174.66, 0.48),
    tone(0.48, 0.45, 1174.66 * 2, 0.08)
  ])
}

mkdirSync(outputDir, { recursive: true })
for (const [name, samples] of Object.entries(sounds)) {
  writeFileSync(join(outputDir, name), encodeWav(samples))
  console.log(`generated ${name} (${samples.length} samples)`)
}
