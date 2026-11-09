// My Gym's deload week on Today (lib/rir-rules.js).
//
// Every five weeks (counted from the first workout, the last deload week or the last time this
// was put off) the card offers a lighter week. Started, it says which day of it this is and lets
// you end it early. Inside the week every rep exercise is built about 10 % lighter with two thirds
// of its sets, and those sessions do not count for progression (lib/session-start.js), so the
// weights pick up from before the deload afterwards. Nothing happens on its own: it is an offer.
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { deloadDue, deloadWeekOn, daysBetween, DELOAD_EVERY_WEEKS } from '../lib/rir-rules.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'

export default function DeloadCard() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const today = todayISO()
  const week = S.deloadWeek
  if (deloadWeekOn(week, today)) {
    const day = (daysBetween(week.start, today) ?? 0) + 1
    return <div className="card deload-card">
      <div className="deload-head"><Icon name="arrowDown" /><span>{t('Deload week · day {0} of 7', day)}</span></div>
      <div className="small dim deload-text">{t('Lighter sessions: about 10% less weight and a third fewer sets. They don’t count for progression, so next week picks up where you left off.')}</div>
      <Button size="sm" variant="ghost" onClick={() => update(s => { s.deloadWeek = { ...s.deloadWeek, ended: today } })}>{t('End the deload week')}</Button>
    </div>
  }
  const days = (S.workouts || []).map(w => w.d).filter(Boolean).sort()
  const due = deloadDue({ today, firstWorkout: days[0], lastDeload: week?.start, skipped: S.deloadSkipped, weeks: S.deloadEvery || DELOAD_EVERY_WEEKS })
  if (!due.due) return null
  const weeks = Math.floor(due.days / 7)
  const since = week?.start && due.from === week.start
  return <div className="card deload-card">
    <div className="deload-head"><Icon name="arrowDown" /><span>{t('Time for a deload week')}</span></div>
    <div className="small dim deload-text">{since
      ? t('It’s been {0} weeks since your last deload. A lighter week lets you recover and come back stronger.', weeks)
      : t('You’ve trained for {0} weeks. A lighter week lets you recover and come back stronger.', weeks)}</div>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <Button size="sm" variant="tinted" onClick={() => update(s => { s.deloadWeek = { start: today } })}>{t('Start deload week')}</Button>
      <Button size="sm" variant="ghost" onClick={() => update(s => { s.deloadSkipped = today })}>{t('Not now')}</Button>
    </div>
  </div>
}
