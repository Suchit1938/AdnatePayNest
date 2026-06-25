import { useEffect, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

const TablePagination = ({ page, pageSize, setPage, totalItems, totalPages }) => {
  const [pageInput, setPageInput] = useState(String(page));

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  if (totalItems <= pageSize) {
    return null;
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const goToPage = (value) => {
    const requestedPage = Math.round(Number(value));
    const nextPage = Number.isFinite(requestedPage)
      ? Math.min(totalPages, Math.max(1, requestedPage))
      : page;

    setPage(nextPage);
    setPageInput(String(nextPage));
  };

  return (
    <div className="flex flex-col items-stretch justify-between gap-3 border-t border-bank-card-border bg-white px-3 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
      <p className="text-center text-sm font-semibold text-slate-500 sm:text-left">
        Showing {start}-{end} of {totalItems}
      </p>
      <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bank-card-border text-slate-600 transition hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="First page"
        >
          <ChevronFirst size={16} />
        </button>
        <button
          type="button"
          onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bank-card-border text-slate-600 transition hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <label className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-700">
          <span>Page</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            onBlur={() => goToPage(pageInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="h-9 w-16 rounded-lg border border-bank-card-border px-2 text-center text-sm font-bold text-slate-700 outline-none transition focus:border-bank-accent focus:ring-2 focus:ring-bank-accent/20 sm:w-20 sm:px-3"
            aria-label={`Go to page, 1 to ${totalPages}`}
          />
          <span>of {totalPages}</span>
        </label>
        <button
          type="button"
          onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bank-card-border text-slate-600 transition hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => setPage(totalPages)}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bank-card-border text-slate-600 transition hover:bg-bank-surface disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Last page"
        >
          <ChevronLast size={16} />
        </button>
      </div>
    </div>
  );
};

export default TablePagination;
