interface LineChartPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  showArea?: boolean;
}

export default function LineChart({ data, height = 200, color = '#4f46e5', formatValue = (v) => v.toLocaleString(), showArea = true }: LineChartProps) {
  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-codex-text-muted text-sm">
        No data
      </div>
    );
  }

  const width = 500;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = 0;

  const getX = (i: number) => padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const getY = (val: number) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`).join(' ');
  const areaPath = linePath + ` L ${getX(data.length - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

  const gridLines = 4;
  const gridStep = (maxVal - minVal) / gridLines;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const val = minVal + i * gridStep;
        const y = getY(val);
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#3f3f46" strokeWidth="0.5" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="#71717a" fontSize="9" fontFamily="monospace">
              {formatValue(Math.round(val))}
            </text>
          </g>
        );
      })}

      {/* Area */}
      {showArea && (
        <path d={areaPath} fill={color} opacity="0.1" />
      )}

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Points */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={getX(i)} cy={getY(d.value)} r="3" fill={color} />
          {data.length <= 15 && (
            <text
              x={getX(i)}
              y={height - padding.bottom + 16}
              textAnchor="middle"
              fill="#71717a"
              fontSize="8"
              fontFamily="monospace"
              transform={data.length > 10 ? `rotate(-45, ${getX(i)}, ${height - padding.bottom + 16})` : ''}
            >
              {d.label}
            </text>
          )}
        </g>
      ))}

      {/* X-axis labels when too many points */}
      {data.length > 15 && (
        <>
          <text x={getX(0)} y={height - 8} textAnchor="start" fill="#71717a" fontSize="8" fontFamily="monospace">{data[0].label}</text>
          <text x={getX(data.length - 1)} y={height - 8} textAnchor="end" fill="#71717a" fontSize="8" fontFamily="monospace">{data[data.length - 1].label}</text>
        </>
      )}
    </svg>
  );
}
