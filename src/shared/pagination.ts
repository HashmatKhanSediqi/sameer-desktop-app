export const DEFAULT_PAGE_SIZE = 10;
export const MIN_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 100;

export interface ResolvedPagination {
  page: number;
  pageSize: number;
  totalPages: number;
}

export function parseOptionalPage(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
}

export function parsePageSize(value: number | undefined, fallback = DEFAULT_PAGE_SIZE): number {
  const parsed = parseOptionalPage(value, fallback);
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, parsed));
}

export function resolvePagination(
  pageInput: number | undefined,
  pageSizeInput: number | undefined,
  totalCount: number,
  defaultPageSize = DEFAULT_PAGE_SIZE,
): ResolvedPagination {
  const pageSize = parsePageSize(pageSizeInput, defaultPageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const requestedPage = parseOptionalPage(pageInput, 1);
  const page = Math.min(requestedPage, totalPages);
  return { page, pageSize, totalPages };
}
