import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import Elapsed from './Elapsed.jsx'
import { useConnectionTrouble } from './SyncBanner.jsx'
import { retapTab } from '../lib/scroll-top.js'

// Module scope, not TabBar's render body. Declared inside it, `Tab` was a new function on every
// render, so React saw a different component type each time and threw the button away and built a
// fresh one — on a bar that is fixed on screen, and once a second for the whole of a rest. The
// state it took with it is the DOM node itself: focus, the :active tint, any in-flight transition.
function Tab({ active, icon, label, onClick, dot, tour }) {
  return (
    <button className={active ? 'on' : ''} onClick={onClick} data-tour={tour} aria-current={active ? 'page' : undefined}
      aria-label={dot ? label + ', ' + t('Connection problem') : undefined}>
      <span className="tab-ic"><Icon name={icon} />{dot && <span className="tab-dot" aria-hidden="true" />}</span><span>{label}</span>
    </button>
  )
}

// My Gym's four tabs: Today, Routines, Progress, Profile. There is no Start button in the bar:
// Today's own row starts the day's session (views/Home.jsx). A session you stepped away from shows
// as a slim bar over the tabs instead, with its running time, and a tap on it goes back to it.
// The data-tour names are the old tabs' (tab-home, tab-plan, tab-stats) so the tour keeps them.
export default function TabBar() {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  // With the connection banner switched off, a sync problem shows as a dot on Profile, the tab
  // Settings lives under (#369, #330).
  const trouble = useConnectionTrouble()
  const cur = loc.pathname.split('/')[1] || 'home'
  const active = S.active
  const resume = !!active && cur !== 'workout'
  // The rest timer and the page's bottom padding make room for the resume bar while it shows.
  useEffect(() => {
    document.body.classList.toggle('has-resume', resume)
    return () => document.body.classList.remove('has-resume')
  }, [resume])
  if (!user && !isGuest) return null
  // A screen without a tab of its own lights the tab it is opened from (Muscles from both).
  const PARENT = { history: 'stats', 'structural-balance': 'stats', 'progress-photos': 'stats', measurements: 'stats', checkin: 'home', library: 'plan', muscles: 'plan' }
  const parent = cur === 'muscles' && loc.state?.from === '/stats' ? 'stats' : PARENT[cur]
  const on = k => cur === k || parent === k

  // Root tabs are peers, not another level to unwind with Android Back. The tab you are already
  // on takes you to the top of its page instead (lib/scroll-top.js).
  const switchTab = path => {
    if (loc.pathname !== path || loc.search) nav(path, { replace: true })
    else retapTab(path)
  }

  // A live session runs its clock; a past workout being edited or logged after the fact has none.
  const running = resume && !active.editingWorkoutId && !active.backfill && active.start > 0
  const resumeLabel = active?.editingWorkoutId ? t('Edit workout') : t('Resume')

  return (
    <nav id="tabbar" className={resume ? 'with-resume' : undefined}>
      {resume && <button type="button" className="resume" onClick={() => nav('/workout')}
        aria-label={resumeLabel + (active.name ? ', ' + active.name : '')}>
        <span className="resume-dot" aria-hidden="true" />
        <span className="resume-name">{active.name || t('Workout')}</span>
        {running && <span className="resume-time"><Elapsed start={active.start} /></span>}
        <span className="resume-go">{resumeLabel}<Icon name="chevronRight" /></span>
      </button>}
      <Tab active={on('home')} icon="sun" label={t('Today')} onClick={() => switchTab('/home')} tour="tab-home" />
      <Tab active={on('plan')} icon="list" label={t('Routines')} onClick={() => switchTab('/plan')} tour="tab-plan" />
      <Tab active={on('stats')} icon="chartLine" label={t('Progress')} onClick={() => switchTab('/stats')} tour="tab-stats" />
      <Tab active={on('settings')} icon="personCircle" label={t('Profile')} dot={trouble} onClick={() => switchTab('/settings')} tour="tab-profile" />
    </nav>
  )
}
