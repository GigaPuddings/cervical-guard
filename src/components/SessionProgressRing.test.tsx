import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SessionProgressRing } from './SessionProgressRing'

describe('SessionProgressRing', () => {
  it('uses theme variables for ring colors', () => {
    const html = renderToStaticMarkup(
      <SessionProgressRing
        progress={42}
        label="连续坐姿"
        value="0:25"
        recommendation="建议 45 分钟休息"
        status="进行中"
      />
    )

    expect(html).toContain('var(--theme-session-ring-track)')
    expect(html).toContain('var(--theme-session-ring-start)')
    expect(html).toContain('var(--theme-session-ring-mid)')
    expect(html).toContain('var(--theme-session-ring-end)')
    expect(html).toContain('var(--theme-session-ring-dot-stroke)')
  })

  it('can render an overdue state without changing the elapsed value', () => {
    const html = renderToStaticMarkup(
      <SessionProgressRing
        progress={100}
        label="连续坐姿"
        value="98:49"
        recommendation="建议 45 分钟休息"
        status="已超时"
        detail="已超过建议 53 分钟"
        tone="danger"
      />
    )

    expect(html).toContain('98:49')
    expect(html).toContain('已超过建议 53 分钟')
    expect(html).toContain('var(--theme-danger)')
  })
})
