/**
 * Loads EVERY page of a paginated list, so a dropdown never silently misses records
 * beyond the first page (e.g. vendor no. 201 or machine no. 101).
 *
 *   fetchAllPages(vendorApi.list, 'vendors', { status: 'active' })
 *
 * Works with either `{ pagination: { totalPages } }` or `{ total, pageSize }` responses.
 */
export async function fetchAllPages(listFn, key, params = {}, pageSize = 100) {
  const first = await listFn({ ...params, page: 1, pageSize });
  const total = first?.pagination?.total ?? first?.total;
  const size = first?.pagination?.pageSize ?? first?.pageSize ?? pageSize;
  const totalPages = first?.pagination?.totalPages
    ?? (total != null && size ? Math.ceil(Number(total) / Number(size)) : 1);
  const pages = Math.min(Math.max(1, Number(totalPages) || 1), 200);
  const rest = pages > 1
    ? await Promise.all(Array.from({ length: pages - 1 }, (_, i) => listFn({ ...params, page: i + 2, pageSize })))
    : [];
  return [first, ...rest].flatMap((d) => d?.[key] ?? []);
}

export default fetchAllPages;
