
export default function PageHeader({ overline, title, children }) {
  return (
    <div className="px-8 pt-8 pb-5 border-b border-[#262626] flex items-end justify-between gap-6 flex-wrap">
      <div>
        <p className="font-mono text-[11px] tracking-widest uppercase text-[#00FF66] mb-2">// {overline}</p>
        <h1 className="font-display font-bold text-3xl tracking-tight" data-testid="page-title">{title}</h1>
      </div>
      <div className="flex items-end gap-3 flex-wrap">{children}</div>
    </div>
  );
}

