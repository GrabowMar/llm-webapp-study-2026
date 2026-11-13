import type { ProjectTotal } from "../api";

type Props = {
  totals: ProjectTotal[];
};

export default function TotalsCard({ totals }: Props) {
  const grand = totals.reduce((sum, row) => sum + row.hours, 0);
  const roundedGrand = Math.round(grand * 100) / 100;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Totals per project
        </h2>
        <p className="text-xs text-gray-500">Based on the current filters</p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2">Project</th>
            <th className="px-4 py-2 text-right">Hours</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {totals.map((row) => (
            <tr key={row.project} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-900">
                {row.project}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                {row.hours}
              </td>
            </tr>
          ))}
          {totals.length === 0 && (
            <tr>
              <td
                colSpan={2}
                className="px-4 py-8 text-center text-sm text-gray-500"
              >
                No hours recorded for this period.
              </td>
            </tr>
          )}
        </tbody>
        {totals.length > 0 && (
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50">
              <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">
                Total
              </td>
              <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-gray-900">
                {roundedGrand}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
