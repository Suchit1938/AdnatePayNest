import { useMemo, useState } from "react";

export const TABLE_PAGE_SIZE = 7;

const usePaginatedRows = (rows = [], pageSize = TABLE_PAGE_SIZE) => {
  const [page, setPage] = useState(1);
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [pageSize, rows, safePage]);

  const setSafePage = (nextPage) => {
    setPage((currentPage) => {
      const resolvedPage =
        typeof nextPage === "function" ? nextPage(currentPage) : nextPage;

      return Math.min(Math.max(1, resolvedPage), totalPages);
    });
  };

  return {
    page: safePage,
    pageRows,
    pageSize,
    setPage: setSafePage,
    totalItems,
    totalPages,
  };
};

export default usePaginatedRows;
