type DashboardEmptyStateProps = {
  title: string;
  description: string;
};

export function DashboardEmptyState({
  title,
  description,
}: DashboardEmptyStateProps) {
  return (
    <div className="flat-panel rounded-3xl border border-dashed border-white/10 px-8 py-14 text-center">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-3 text-sm leading-7 text-gray-400">{description}</p>
      </div>
    </div>
  );
}
