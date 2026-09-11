import type React from 'react'
import { useCallback, useState } from 'react'
import appIcon from './assets/app-icon.png'
import revoLogo from './assets/revocon-logo.png'
import HomePage from './pages/HomePage'
import DiaryPage from './pages/DiaryPage'
import FoodsPage from './pages/FoodsPage'
import WeightPage from './pages/WeightPage'
import ExercisePage from './pages/ExercisePage'
import SettingsPage from './pages/SettingsPage'

export type AppView = 'home' | 'diary' | 'foods' | 'weight' | 'exercise' | 'settings'

const NAV: { id: AppView; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'diary', label: 'Diary' },
  { id: 'foods', label: 'Foods' },
  { id: 'weight', label: 'Weight' },
  { id: 'exercise', label: 'Exercise' },
  { id: 'settings', label: 'Settings' }
]

export default function App(): React.JSX.Element {
  const [view, setView] = useState<AppView>('home')
  const [toast, setToast] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={appIcon} alt="" className="brand-mark" width={44} height={44} />
          <div>
            <h1>MyHealth L.W</h1>
            <span className="tag">Food · Weight · Balance</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'active' : ''}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main-col">
        <main className="content" key={`${view}-${refreshKey}`}>
          {view === 'home' && <HomePage onToast={showToast} onNavigate={setView} />}
          {view === 'diary' && <DiaryPage onToast={showToast} />}
          {view === 'foods' && <FoodsPage onToast={showToast} />}
          {view === 'weight' && <WeightPage onToast={showToast} />}
          {view === 'exercise' && <ExercisePage onToast={showToast} />}
          {view === 'settings' && <SettingsPage onToast={showToast} onReset={bump} />}
        </main>

        <footer className="app-credit" title="RevoCon">
          <img src={revoLogo} alt="" className="app-credit-logo" height={13} />
          <span>
            RevoCon<sup className="tm">™</sup> · L.W.
          </span>
        </footer>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
