type DashboardKpiCardProps = {
  label: string;
  value: string;
  accentClass?: string;
};

export function DashboardKpiCard({
  label,
  value,
  accentClass = "text-bili-blue",
}: DashboardKpiCardProps) {
  return (
    <div className="flat-panel rounded-2xl px-4 py-4">
      <p className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accentClass}`}>
        {value}
      </p>
    </div>
  );
}
