import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const toNumber = (value) => Number(value || 0);

export const ChartEmptyState = ({ message = "No records are available to chart." }) => (
  <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-bank-card-border bg-bank-surface px-4 text-center text-sm font-semibold text-slate-500">
    {message}
  </div>
);

const tooltipFormatter = (formatter) => (value, name, item) => [
  formatter ? formatter(value, item?.payload) : value,
  name,
];

const DefaultTooltip = ({ valueFormatter, labelFormatter }) => (
  <Tooltip
    cursor={{ fill: "rgba(15, 23, 42, 0.06)" }}
    formatter={tooltipFormatter(valueFormatter)}
    labelFormatter={labelFormatter}
    contentStyle={{
      border: "1px solid #dbe3ef",
      borderRadius: 8,
      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
      fontSize: 12,
      fontWeight: 700,
    }}
  />
);

export const RechartsHorizontalBar = ({
  rows,
  valueFormatter,
  emptyMessage,
  height = 270,
}) => {
  const data = rows.map((row) => ({
    ...row,
    value: toNumber(row.value),
  }));

  if (data.every((row) => row.value === 0)) {
    return <ChartEmptyState message={emptyMessage || "No records are available to chart."} />;
  }

  return (
    <div className="h-[270px]" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
            tickFormatter={valueFormatter}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fill: "#334155", fontSize: 12, fontWeight: 700 }}
          />
          <DefaultTooltip valueFormatter={valueFormatter} />
          <Bar dataKey="value" name="Value" radius={[0, 8, 8, 0]}>
            {data.map((row, index) => (
              <Cell key={row.label} fill={row.color || ["#2563eb", "#0891b2", "#10b981", "#f59e0b"][index % 4]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const RechartsColumn = ({
  rows,
  valueFormatter,
  emptyMessage,
  height = 270,
}) => {
  const data = rows.map((row) => ({
    ...row,
    value: toNumber(row.value),
  }));

  if (data.every((row) => row.value === 0)) {
    return <ChartEmptyState message={emptyMessage || "No records are available to chart."} />;
  }

  return (
    <div className="h-[270px]" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 12, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
            interval={0}
            tickMargin={10}
          />
          <YAxis
            tick={{ fill: "#64748b", fontSize: 12, fontWeight: 700 }}
            tickFormatter={valueFormatter}
          />
          <DefaultTooltip valueFormatter={valueFormatter} />
          <Bar dataKey="value" name="Value" radius={[8, 8, 0, 0]}>
            {data.map((row, index) => (
              <Cell key={row.label} fill={row.color || ["#2563eb", "#0891b2", "#10b981", "#f59e0b"][index % 4]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const RechartsDonut = ({
  rows,
  emptyMessage,
  height = 270,
}) => {
  const data = rows
    .map((row) => ({
      ...row,
      value: toNumber(row.value),
    }))
    .filter((row) => row.value > 0);

  if (data.length === 0) {
    return <ChartEmptyState message={emptyMessage || "No records are available to chart."} />;
  }

  return (
    <div className="h-[270px]" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="56%"
            outerRadius="78%"
            paddingAngle={2}
          >
            {data.map((row, index) => (
              <Cell key={row.label} fill={row.color || ["#2563eb", "#0891b2", "#10b981", "#f59e0b"][index % 4]} />
            ))}
          </Pie>
          <DefaultTooltip />
          <Legend
            iconType="circle"
            formatter={(value) => <span className="text-sm font-bold text-slate-700">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
