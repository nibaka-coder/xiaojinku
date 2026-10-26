import { useStore } from '@/store/useStore'
import SubPage from './SubPage'
import type { CostBasis } from '@/types'

export default function Invest() {
  const costBasis = useStore((s) => s.settings.costBasis ?? 'actual')
  const setCostBasis = useStore((s) => s.setCostBasis)

  return (
    <SubPage title="投资设置">
      <section className="card space-y-3">
        <h2 className="font-medium text-main">持仓成本口径</h2>
        <p className="text-xs text-sub">
          只影响持仓页「成本 / 浮动盈亏」怎么显示，两种口径算出的净资产完全相同。
        </p>
        <div className="seg w-full">
          {(
            [
              ['actual', '真实成本'],
              ['amortized', '摊薄成本'],
            ] as [CostBasis, string][]
          ).map(([b, label]) => (
            <button
              key={b}
              onClick={() => setCostBasis(b)}
              className={`seg-item flex-1 ${costBasis === b ? 'seg-item-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-faint">
          {costBasis === 'actual'
            ? '成本 = 你实际投入的钱；分红单独列为收益。累计分红再多，成本也始终是你投进去的数。'
            : '成本 = 投入的钱 − 累计分红到手（券商 App 常见的「保本价」）。长期高分红股的成本可能摊到 0 甚至负数，届时盈亏率不再显示。'}
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium text-main">分红</h2>
        <p className="text-xs text-sub">
          分红不再手动记账：在投资模块的「持仓 / 交易记录」点「↻ 刷新行情」会顺便检测待入账分红，
          确认后自动写入（已入账的不会重复提醒）。分红页可查看与忽略。
        </p>
      </section>
    </SubPage>
  )
}
