import type { Card, CardEffect, EffectTiming } from '@engine/types';
import { EFFECTS, effectParam } from '@engine';

/**
 * An effect at a glance: what it is, the numbers that make it that card, and
 * the two modifiers that belong to it — the ⚡ it costs and the dice it rolls.
 */
export function effectSummary(effect: CardEffect): string {
  const def = EFFECTS[effect.type];
  if (!def) return effect.type;
  const parts = def.params.map((p) => `${effectParam(effect, p.key)}${p.symbol ?? ''}`);
  if (effect.cost) parts.unshift(`${effect.cost}⚡`);
  if (effect.dice) {
    const count = effect.dice.count === 'variable' ? 'X' : effect.dice.count;
    parts.push(`${count}${effect.dice.die}`);
  }
  return parts.length > 0 ? `${def.label} ${parts.join(' / ')}` : def.label;
}

const TONE: Record<EffectTiming, string> = {
  active: 'border-amber-700 text-amber-700',
  passive: 'border-steel-700 text-steel-700',
  event: 'border-putty-700 text-putty-700',
};

/**
 * The effect list as chips. This is the card's whole behaviour, so it reads
 * as one line in the table and doubles as the way into the card panel.
 */
export function EffectChips({ card, onOpen }: { card: Card; onOpen?: () => void }) {
  const effects = card.effects ?? [];

  if (effects.length === 0) {
    // A cockpit's weapon, shield and generator are intrinsic to being a
    // cockpit — an empty list is right there, and only there.
    const intrinsic = card.kind === 'part' && card.partType === 'cockpit';
    return (
      <button
        type="button"
        onClick={onOpen}
        className={[
          'cursor-pointer px-1 text-left font-mono text-[10px] italic',
          intrinsic ? 'text-putty-600' : 'text-toggle-red-500',
        ].join(' ')}
      >
        {intrinsic ? 'intrinsic ⚔️ ⚡ gen' : 'no effects'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={effects.map(effectSummary).join(' · ')}
      className="flex w-full cursor-pointer flex-wrap gap-1 px-1 py-1 text-left"
    >
      {effects.map((effect, i) => {
        const def = EFFECTS[effect.type];
        return (
          <span
            key={`${effect.type}-${i}`}
            className={[
              'border px-1 py-px font-mono text-[10px] whitespace-nowrap',
              def ? TONE[def.timing] : 'border-toggle-red-500 text-toggle-red-500',
              def?.coded ? 'border-dashed' : '',
            ].join(' ')}
          >
            {effectSummary(effect)}
          </span>
        );
      })}
    </button>
  );
}
