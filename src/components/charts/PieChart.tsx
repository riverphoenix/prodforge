interface PieChartItem {
  label: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: PieChartItem[];
  size?: number;
  donut?: boolean;
  formatValue?: (v: number) => string;
}

export default function PieChart({ data, size = 200, donut = true, formatValue = (v) => v.toLocaleString() }: PieChartProps) {
  if (data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div style={{ height: size }} className="flex items-center justify-center text-codex-text-muted text-sm">
        No data
      </div>
    );
  }

  const defaultColors = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size - 20) / 2;
  const innerR = donut ? outerR * 0.55 : 0;

  let currentAngle = -Math.PI / 2;

  const slices = data.filter(d => d.value > 0).map((item, i) => {
    const angle = (item.value / total) * Math.PI * 2;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    let d: string;
    if (donut) {
      const ix1 = cx + innerR * Math.cos(startAngle);
      const iy1 = cy + innerR * Math.sin(startAngle);
      const ix2 = cx + innerR * Math.cos(endAngle);
      const iy2 = cy + innerR * Math.sin(endAngle);
      d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
    } else {
      d = `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    const color = item.color || defaultColors[i % defaultColors.length];
    const pct = ((item.value / total) * 100).toFixed(1);

    return { d, color, label: item.label, value: item.value, pct };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice, i) => (
          <path key={i} d={slice.d} fill={slice.color} opacity="0.85" stroke="#1e1e1e" strokeWidth="1" />
        ))}
        {donut && (
          <text x={cx} y={cy + 4} textAnchor="middle" fill="#d4d4d8" fontSize="12" fontFamily="monospace" fontWeight="600">
            {formatValue(total)}
          </text>
        )}
      </svg>
      <div className="space-y-1.5">
        {slices.map((slice, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: slice.color, opacity: 0.85 }} />
            <span className="text-[11px] text-codex-text-secondary truncate max-w-28">{slice.label}</span>
            <span className="text-[10px] text-codex-text-muted ml-auto">{slice.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
