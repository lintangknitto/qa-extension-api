export interface INormalizedPagination {
	page: number;
	perPage: number;
	offset: number;
}

/**
 * Menormalkan page/perPage dari query menjadi nilai aman untuk LIMIT/OFFSET.
 */
export const normalizePagination = (
	page: number | undefined,
	perPage: number | undefined
): INormalizedPagination => {
	const safePage = page === undefined || page < 0 ? 0 : page;
	const safePerPage = perPage === undefined || perPage < 5 ? 20 : Math.min(perPage, 100);
	return { page: safePage, perPage: safePerPage, offset: safePage * safePerPage };
};
