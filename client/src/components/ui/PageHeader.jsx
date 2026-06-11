const PageHeader = ({ eyebrow, title, subtitle, children }) => (
  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-bank-card-border/70 pb-6">
    <div className="min-w-0">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className={eyebrow ? "page-title mt-2" : "page-title"}>{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
  </div>
);

export default PageHeader;
