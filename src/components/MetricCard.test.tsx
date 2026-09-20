import { Clock3 } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MetricCard } from './MetricCard'

describe('MetricCard progress', () => {
  it('does not render a false filled segment for zero progress', () => {
    const html = renderToStaticMarkup(<MetricCard icon={Clock3} label="今日坐姿" value="0 分钟" progress={0} />)

    expect(html).not.toContain('data-metric-progress')
  })

  it('renders the actual clamped percentage without a decorative minimum', () => {
    const html = renderToStaticMarkup(<MetricCard icon={Clock3} label="今日坐姿" value="15 分钟" progress={25} />)

    expect(html).toContain('data-metric-progress="25"')
    expect(html).toContain('width:25%')
  })
})
