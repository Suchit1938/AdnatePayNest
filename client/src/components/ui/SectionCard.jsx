const SectionCard = ({
  title,
  subtitle,
  icon: Icon,
  children,
  className = "",
  ...sectionProps
}) => (
  <section className={`card-padded min-w-0 ${className}`.trim()} {...sectionProps}>
    {(title || subtitle || Icon) && (
      <div className="mb-5 flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="shrink-0 rounded-lg bg-bank-surface p-2.5 text-bank-eyebrow">
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {title && <h2 className="break-words text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
      </div>
    )}
    {children}
  </section>
);

export default SectionCard;
