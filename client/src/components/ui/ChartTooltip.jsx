const ChartTooltip = ({ label, value, detail, percent, className = "" }) => (
  <div
    className={`pointer-events-none absolute z-20 min-w-44 max-w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5 ${className}`}
  >
    <p className="truncate text-xs font-bold uppercase text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-extrabold text-slate-950">{value}</p>
    {typeof percent !== "undefined" && (
      <p className="mt-0.5 text-xs font-semibold text-blue-700">{percent}% of total</p>
    )}
    {detail && <p className="mt-1 whitespace-normal break-words text-xs font-semibold text-slate-500">{detail}</p>}
  </div>
);

export default ChartTooltip;
