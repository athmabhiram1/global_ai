// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OverviewKPIs, MeasuredStrip } from './Overview'

afterEach(() => cleanup())
import { decisionListItemFixture } from '../testFixtures'

describe('OverviewKPIs', () => {
  it('computes gateway overhead, token cut, admitted/killed and credits from the ledger', () => {
    const rows = [
      decisionListItemFixture,
      {
        ...decisionListItemFixture,
        id: 'rq-2',
        ms: 11,
        tin: 2000,
        tout: 1000,
        cin: 4,
        cout: 1,
        cred: 2,
      },
    ]
    render(<OverviewKPIs rows={rows} />)
    expect(screen.getByTestId('kpi-latency').textContent).toContain('10')
    expect(screen.getByTestId('kpi-cut').textContent).toContain('25')
    expect(screen.getByTestId('kpi-chunks').textContent).toContain('3')
    expect(screen.getByTestId('kpi-chunks').textContent).toContain('4')
    expect(screen.getByTestId('kpi-credits').textContent).toContain('2')
  })

  it('renders zeroed KPIs when the ledger is empty', () => {
    render(<OverviewKPIs rows={[]} />)
    expect(screen.getByTestId('kpi-latency').textContent).toContain('0')
    expect(screen.getByTestId('kpi-chunks').textContent).toContain('0')
  })
})

describe('MeasuredStrip', () => {
  it('publishes the eval numbers: 0.480 -> 1.000, -12.0%, 9 ms', () => {
    render(<MeasuredStrip />)
    const strip = screen.getByTestId('measured-strip')
    expect(strip.textContent).toContain('0.480')
    expect(strip.textContent).toContain('1.000')
    expect(strip.textContent).toContain('12.0%')
    expect(strip.textContent).toContain('9 ms')
  })
})
