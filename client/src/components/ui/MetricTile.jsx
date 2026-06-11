const toneStyles = {
  accent: "border-bank-card-border bg-bank-surface text-bank-eyebrow",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  warning: "border-amber-100 bg-amber-50 text-amber-700",
  danger: "border-red-100 bg-red-50 text-red-700",
  default: "border-bank-card-border bg-white text-slate-900",
};

const MetricTile = ({ label, value, tone = "default" }) => (
  <div className={`metric-tile ${toneStyles[tone] || toneStyles.default}`}>
    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
      {label}
    </p>
    <p className="mt-2 break-words text-2xl font-bold">{value}</p>
  </div>
);

export default MetricTile;
