interface SectionHeaderProps {
  number: string;
  title: string;
  subtitle: string;
  rightSlot?: React.ReactNode;
}

export function SectionHeader({ number, title, subtitle, rightSlot }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="font-tabular text-xs font-semibold tracking-[0.18em] text-[#00A795] uppercase">
          {number}
        </div>
        <h2 className="font-editorial-serif mt-1.5 text-3xl font-bold tracking-tight text-[#1B1B2F] sm:text-4xl">
          {title}
        </h2>
        <p className="mt-2 text-sm italic text-[#6B7280] sm:text-base">{subtitle}</p>
      </div>
      {rightSlot ? <div className="no-print shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
