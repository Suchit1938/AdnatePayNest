const PageHeader = ({ eyebrow, title, subtitle, children }) => (
  <div className="flex min-w-0 flex-col items-stretch justify-between gap-4 border-b border-bank-card-border/70 pb-5 md:flex-row md:items-start md:pb-6">
    <div className="min-w-0 flex-1">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className={eyebrow ? "page-title mt-2" : "page-title"}>{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
    {children && (
      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:justify-end">
        {children}
      </div>
    )}
  </div>
);

export default PageHeader;
