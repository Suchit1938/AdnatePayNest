import { ChevronLeft, ChevronRight } from "lucide-react";

const TablePagination = ({ page, pageSize, setPage, totalItems, totalPages }) => {
  if (totalItems <= pageSize) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bank-card-border bg-white px-5 py-4">
      <p className="text-sm font-semibold text-slate-500">
        Showing {start}-{end} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bank-card-border text-slate-600 transition hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-20 text-center text-sm font-bold text-slate-700">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bank-card-border text-slate-600 transition hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
