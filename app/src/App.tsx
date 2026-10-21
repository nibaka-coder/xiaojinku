import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store/useStore'
import { useSyncStore, startSyncWatcher } from './store/useSyncStore'
import Layout from './components/Layout'
import LockScreen from './components/LockScreen'
import LoadingScreen from './components/LoadingScreen'
import SyncConflictDialog from './components/SyncConflictDialog'
import Overview from './pages/Overview'
import AddTransaction from './pages/AddTransaction'
import Transactions from './pages/Transactions'
import Statistics from './pages/Statistics'
import Settings from './pages/Settings'
import Holdings from './pages/Holdings'
import Trades from './pages/Trades'
import AddInvestTxn from './pages/AddInvestTxn'

// 根据设置应用浅/暗主题
function useTheme() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', dark)
    }
    apply()
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [theme])
}

export default function App() {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated())
  const appLockEnabled = useStore((s) => s.settings.appLockEnabled)
  const [locked, setLocked] = useState(appLockEnabled)
  const conflict = useSyncStore((s) => s.conflict)
  const syncStatus = useSyncStore((s) => s.status)
  const resolveWithRemote = useSyncStore((s) => s.resolveWithRemote)
  const resolveWithLocal = useSyncStore((s) => s.resolveWithLocal)
  const dismissConflict = useSyncStore((s) => s.dismissConflict)
  useTheme()

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true))
    setHydrated(useStore.persist.hasHydrated())
    return unsub
  }, [])

  // 数据就绪后启动同步：先拉一次（新设备自动取回数据），并监听改动自动推送
  useEffect(() => {
    if (!hydrated) return
    startSyncWatcher()
    const sync = useStore.getState().settings.sync
    if (sync.enabled && sync.url) useSyncStore.getState().syncNow()
  }, [hydrated])

  if (!hydrated) return <LoadingScreen />
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Overview />} />
          <Route path="/add" element={<AddTransaction />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/invest" element={<Navigate to="/invest/holdings" replace />} />
          <Route path="/invest/holdings" element={<Holdings />} />
          <Route path="/invest/trades" element={<Trades />} />
          <Route path="/invest/add" element={<AddInvestTxn />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <SyncConflictDialog
        open={!!conflict}
        remote={conflict?.state}
        busy={syncStatus === 'syncing'}
        onUseRemote={resolveWithRemote}
        onUseLocal={resolveWithLocal}
        onCancel={dismissConflict}
      />
    </>
  )
}
