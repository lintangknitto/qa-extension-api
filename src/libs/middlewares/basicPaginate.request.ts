import { any, InferOutput, minValue, number, object, pipe, transform } from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

const basicPaginate = object({
	page: pipe(
		any(),
		transform((input) => parseInt(input, 10)),
		number(ERROR_VALIDATION_MSG.number('Page')),
		minValue(0, ERROR_VALIDATION_MSG.minValue('Page', 0))
	),
	perPage: pipe(
		any(),
		transform((input) => parseInt(input, 10)),
		number(ERROR_VALIDATION_MSG.number('Per Page')),
		minValue(5, ERROR_VALIDATION_MSG.minValue('Per Page', 10))
	)
});
export type TBasicPaginateRequest = InferOutput<typeof basicPaginate>;

export default {
	basicPaginate
};
