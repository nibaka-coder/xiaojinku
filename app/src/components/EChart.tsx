import { useEffect, useRef } from 'react'
// 按需引入：全量 echarts 压缩后约 1MB，本应用只用到折线/柱/饼三种图 + 三个基础组件。
// ⚠️ 新增图表类型或组件（如 dataZoom、markLine、toolbox）必须在这里 use() 注册，否则图表不显示。
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsOption } from 'echarts'

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])

// 通用 ECharts 容器：自适应宽度，option 变化时重绘
export default function EChart({ option, height = 260 }: { option: EChartsOption; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<ECharts | null>(null)
  useEffect(() => {
    if (!ref.current) return
    chart.current = echarts.init(ref.current)
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [])
  useEffect(() => {
    chart.current?.setOption(option, true)
  }, [option])
  return <div ref={ref} style={{ height }} />
}
