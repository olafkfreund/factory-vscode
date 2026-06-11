import { motion } from "framer-motion";

interface Props {
  percent: number | null;
  color: string;
  size?: number;
}

/** Animated circular progress indicator. Indeterminate (dashed) when null. */
export function ProgressRing({ percent, color, size = 36 }: Props) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - pct / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#3c3836" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{ strokeDashoffset: percent == null ? circumference * 0.75 : offset }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className="ring-label" fill={color}>
        {percent == null ? "" : `${Math.round(pct)}`}
      </text>
    </svg>
  );
}
