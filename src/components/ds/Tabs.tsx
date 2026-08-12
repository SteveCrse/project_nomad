interface TabsProps<T extends string> {
  items: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}

export function Tabs<T extends string>({ items, active, onChange }: TabsProps<T>) {
  return (
    <div className="flex" role="tablist">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={[
              'cursor-pointer border-none bg-transparent px-4 py-2.5',
              'font-body text-[13px] font-semibold tracking-label uppercase',
              'border-b-[3px] transition-colors duration-100 ease-snap',
              isActive
                ? 'border-accent-primary-text text-accent-primary-text'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
