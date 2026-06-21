import { useEffect, useRef, type JSX } from 'react'

interface Props {
  /** Returns the current 0..1 level on demand; polled via rAF. */
  getLevel: () => number
  label: string
  active: boolean
}

export function LevelMeter({ getLevel, label, active }: Props): JSX.Element {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const lvl = active ? getLevel() : 0
      if (barRef.current) barRef.current.style.width = `${Math.round(lvl * 100)}%`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [getLevel, active])

  return (
    <div className="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-track">
        <div ref={barRef} className="meter-bar" />
      </div>
    </div>
  )
}
