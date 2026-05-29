"use client";

interface Props {
  score: number;
}

export default function ScoreGauge({ score }: Props) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, score));
  const offset = c - (c * v) / 100;
  const color = v >= 75 ? "#10b981" : v >= 55 ? "#3a5ef0" : v >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r={r} stroke="#e2e8f0" strokeWidth="8" fill="none" />
      <circle
        cx="40"
        cy="40"
        r={r}
        stroke={color}
        strokeWidth="8"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="40"
        y="44"
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fill="#0f172a"
      >
        {Math.round(v)}
      </text>
    </svg>
  );
}
