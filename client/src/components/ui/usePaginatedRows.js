import { useEffect, useMemo, useState } from "react";

export const TABLE_PAGE_SIZE = 7;

const usePaginatedRows = (rows = [], pageSize = TABLE_PAGE_SIZE) => {
  const [page, setPage] = useState(1);
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setPage(1);
  }, [pageSize, totalItems]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows]);

  return {
    page,
    pageRows,
    pageSize,
    setPage,
    totalItems,
    totalPages,
  };
};

export default usePaginatedRows;
