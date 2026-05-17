import React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface ChartProps {
  data: Array<Record<string, unknown>>;
  className?: string;
}

const chartTooltipStyle = {
  backgroundColor: 'var(--akiva-chart-tooltip-bg)',
  border: '1px solid var(--akiva-chart-tooltip-border)',
  borderRadius: '8px',
  color: 'var(--akiva-chart-tooltip-text)',
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
};

export function RevenueChart({ data, className = '' }: ChartProps) {
  return (
    <div className={`h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--akiva-chart-ink)" stopOpacity={0.24}/>
              <stop offset="95%" stopColor="var(--akiva-chart-ink)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--akiva-chart-grid)" />
          <XAxis dataKey="month" stroke="var(--akiva-chart-muted)" fontSize={12} />
          <YAxis stroke="var(--akiva-chart-muted)" fontSize={12} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--akiva-chart-ink)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorRevenue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpenseChart({ data, className = '' }: ChartProps) {
  return (
    <div className={`h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--akiva-chart-grid)" />
          <XAxis dataKey="category" stroke="var(--akiva-chart-muted)" fontSize={12} />
          <YAxis stroke="var(--akiva-chart-muted)" fontSize={12} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Bar dataKey="amount" fill="var(--akiva-chart-danger)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CashFlowChart({ data, className = '' }: ChartProps) {
  return (
    <div className={`h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--akiva-chart-grid)" />
          <XAxis dataKey="month" stroke="var(--akiva-chart-muted)" fontSize={12} />
          <YAxis stroke="var(--akiva-chart-muted)" fontSize={12} />
          <Tooltip contentStyle={chartTooltipStyle} />
          <Legend />
          <Line
            type="monotone"
            dataKey="inflow"
            stroke="var(--akiva-chart-success)"
            strokeWidth={3}
            dot={{ fill: 'var(--akiva-chart-success)', strokeWidth: 2, r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="outflow"
            stroke="var(--akiva-chart-danger)"
            strokeWidth={3}
            dot={{ fill: 'var(--akiva-chart-danger)', strokeWidth: 2, r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccountsBreakdownChart({ data, className = '' }: ChartProps) {
  const colors = [
    'var(--akiva-chart-ink)',
    'var(--akiva-chart-success)',
    'var(--akiva-chart-warning)',
    'var(--akiva-chart-danger)',
    'var(--akiva-chart-brand)',
  ];

  return (
    <div className={`h-80 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={120}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={chartTooltipStyle} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
