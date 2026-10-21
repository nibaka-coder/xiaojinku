export default function LoadingScreen() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-3 text-slate-400">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      <p className="text-sm">正在加载本地数据…</p>
    </div>
  )
}
