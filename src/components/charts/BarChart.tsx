interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartItem[];
  height?: number;
  formatValue?: (v: number) => string;
  horizontal?: boolean;
}

export default function BarChart({ data, height = 200, formatValue = (v) => v.toLocaleString(), horizontal = true }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-codex-text-muted text-sm">
        No data
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const defaultColors = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  if (horizontal) {
    const barHeight = Math.min(28, (height - 20) / data.length);
    const chartHeight = Math.max(height, data.length * (barHeight + 6));
    const labelWidth = 120;

    return (
      <svg width="100%" height={chartHeight} viewBox={`0 0 500 ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
        {data.map((item, i) => {
          const y = i * (barHeight + 6) + 4;
          const barWidth = (item.value / maxValue) * (500 - labelWidth - 60);
          const color = item.color || defaultColors[i % defaultColors.length];

          return (
            <g key={i}>
              <text x={labelWidth - 4} y={y + barHeight / 2 + 4} textAnchor="end" fill="#a1a1aa" fontSize="11" fontFamily="monospace">
                {item.label.length > 18 ? item.label.substring(0, 18) + '...' : item.label}
              </text>
              <rect x={labelWidth} y={y} width={Math.max(barWidth, 2)} height={barHeight} rx="3" fill={color} opacity="0.85" />
              <text x={labelWidth + barWidth + 6} y={y + barHeight / 2 + 4} fill="#d4d4d8" fontSize="10" fontFamily="monospace">
                {formatValue(item.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  const barWidth = Math.min(40, (500 - 60) / data.length - 8);
  const chartWidth = data.length * (barWidth + 8) + 60;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMidYMid meet">
      {data.map((item, i) => {
        const x = i * (barWidth + 8) + 40;
        const barH = (item.value / maxValue) * (height - 40);
        const color = item.color || defaultColors[i % defaultColors.length];

        return (
          <g key={i}>
            <rect x={x} y={height - 30 - barH} width={barWidth} height={barH} rx="3" fill={color} opacity="0.85" />
            <text x={x + barWidth / 2} y={height - 14} textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">
              {item.label.length > 6 ? item.label.substring(0, 6) : item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
