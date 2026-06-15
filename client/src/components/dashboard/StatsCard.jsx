const badgeStyles = {
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-1 ring-red-100",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  neutral: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
};

const StatsCard = ({
  title,
  value,
  icon: Icon,
  accent = "bg-bank-accent",
  iconTone = "bg-blue-50 text-blue-600",
  badge,
  footer,
}) => {
  const isRich = Icon || badge || footer;

  if (!isRich) {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-bank-card-border bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-bank-accent" />

        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          {title}
        </h3>

        <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      </div>
    );
  }

  const FooterIcon = footer?.icon;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-bank-card-border bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />

      <div className="flex items-center gap-3 sm:gap-4">
        <div className={`shrink-0 rounded-lg p-2.5 shadow-sm sm:p-3 ${iconTone}`}>
          <Icon size={22} strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {title}
          </p>
          <p className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{value}</p>
        </div>
      </div>

      {(badge || footer) && (
        <div className="mt-4 min-h-[28px]">
          {badge && (
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeStyles[badge.tone] || badgeStyles.neutral}`}
            >
              {badge.text}
            </span>
          )}

          {footer && (
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              {FooterIcon && (
                <FooterIcon
                  size={14}
                  className={footer.iconClassName || "text-slate-400"}
                  strokeWidth={2}
                />
              )}
              <span>{footer.text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StatsCard;
