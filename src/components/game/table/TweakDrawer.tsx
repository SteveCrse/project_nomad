import { useEffect } from 'react';
import { TWEAK_DEFAULTS, useUiStore, type TableTweaks } from '@/store/uiStore';

const OPTIONS: { [K in keyof TableTweaks]: { label: string; opts: [TableTweaks[K], string][] } } = {
  surface: { label: 'Table surface', opts: [['putty', 'Putty'], ['felt', 'Felt'], ['walnut', 'Walnut'], ['night', 'Night']] },
  size: { label: 'Card size', opts: [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']] },
  chit: { label: 'Energy markers', opts: [['cube', 'Green cube'], ['disc', 'Amber disc'], ['hex', 'Green hex']] },
  die: { label: 'Die', opts: [['ivory', 'Ivory'], ['red', 'Red'], ['crt', 'CRT black']] },
  hand: { label: 'Hand', opts: [['fan', 'Fanned'], ['row', 'Laid out']] },
  grid: { label: 'Screen guides (empty cells, front, seat names)', opts: [['on', 'Show'], ['off', 'Hide']] },
  tilt: { label: 'Camera', opts: [['off', 'Top-down'], ['on', 'Seated']] },
  follow: { label: 'Turn the table to the active player', opts: [['on', 'Yes'], ['off', 'No']] },
};

/** How the table looks and moves. Applies live; remembered in this browser. */
export function TweakDrawer() {
  const open = useUiStore((s) => s.tweaksOpen);
  const tweaks = useUiStore((s) => s.tweaks);
  const setTweak = useUiStore((s) => s.setTweak);
  const reset = useUiStore((s) => s.resetTweaks);
  const toggle = useUiStore((s) => s.toggleTweaks);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && toggle(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, toggle]);

  if (!open) return null;
  return (
    <aside className="tt-tweaks" aria-label="Table tweaks">
      <h2>Tweak the table</h2>
      <p className="hint">
        Changes apply live and are remembered in this browser. Zoom: scroll, pinch, or + / −. Pan: drag the table. Double-click the
        table or press 0 to fit.
      </p>
      {(Object.keys(OPTIONS) as (keyof TableTweaks)[]).map((key) => (
        <div key={key} className="tt-tw">
          <span className="tt-hud-k">{OPTIONS[key].label}</span>
          <div className="tt-seg">
            {OPTIONS[key].opts.map(([value, label]) => (
              <button
                key={value}
                className={tweaks[key] === value ? 'on' : ''}
                aria-pressed={tweaks[key] === value}
                onClick={() => setTweak(key, value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="tt-seg">
        <button onClick={reset} disabled={(Object.keys(TWEAK_DEFAULTS) as (keyof TableTweaks)[]).every((k) => tweaks[k] === TWEAK_DEFAULTS[k])}>
          Reset tweaks
        </button>
      </div>
      <button className="tt-btn" style={{ justifySelf: 'start' }} onClick={() => toggle(false)}>
        Close
      </button>
    </aside>
  );
}
