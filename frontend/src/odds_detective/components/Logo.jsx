
export default function Logo({ size = 36, withText = true, variant = "default" }) {
  const accent = "#00FF66";
  const gold = "#FFD700";
  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 64 64" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="oddsLogoBg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0F0F0F" />
              <stop offset="100%" stopColor="#1A1A1A" />
            </linearGradient>
            <linearGradient id="oddsLogoStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accent} />
              <stop offset="100%" stopColor={gold} />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="60" height="60" rx="6" fill="url(#oddsLogoBg)" stroke="url(#oddsLogoStroke)" strokeWidth="1.5" />
          <circle cx="26" cy="26" r="11" fill="none" stroke={accent} strokeWidth="2.2" />
          <line x1="34" y1="34" x2="48" y2="48" stroke={accent} strokeWidth="3" strokeLinecap="round" />
          <path d="M20 22 C20 26 22 30 26 31 C30 30 32 26 32 22" fill="none" stroke={gold} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="20" cy="22" r="1.2" fill={gold} />
          <circle cx="32" cy="22" r="1.2" fill={gold} />
          <circle cx="22" cy="29" r="1" fill={gold} />
          <circle cx="30" cy="29" r="1" fill={gold} />
          <circle cx="50" cy="14" r="1.6" fill={accent} />
          <circle cx="55" cy="20" r="1" fill={gold} opacity="0.7" />
        </svg>
      </div>
      {withText && (
        <div className="leading-none">
          {variant === "hero" ? (
            <>
              <p className="font-display font-bold tracking-widest text-[10px] text-neutral-400 uppercase">// LOGICIEL</p>
              <p className="font-display font-bold text-xl tracking-tight">
                ODDS<span className="text-[#00FF66]">.</span>Détective
              </p>
              <p className="font-mono text-[10px] text-[#00FF66] mt-0.5">v 2.0.0 — Édition 2025</p>
            </>
          ) : (
            <>
              <p className="font-display font-bold tracking-tight text-sm">
                ODDS<span className="text-[#00FF66]">.</span>Détective
              </p>
              <p className="font-mono text-[10px] text-[#00FF66]">v 2.0.0</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

