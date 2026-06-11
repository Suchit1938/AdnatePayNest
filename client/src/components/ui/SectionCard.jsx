const SectionCard = ({
  title,
  subtitle,
  icon: Icon,
  children,
  className = "",
}) => (
  <section className={`card-padded ${className}`.trim()}>
    {(title || subtitle || Icon) && (
      <div className="mb-5 flex items-start gap-3">
        {Icon && (
          <div className="rounded-lg bg-bank-surface p-2.5 text-bank-eyebrow">
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          {title && <h2 className="text-xl font-bold text-slate-900">{title}</h2>}
          {subtitle && <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>}
        </div>
      </div>
    )}
    {children}
  </section>
);

export default SectionCard;
