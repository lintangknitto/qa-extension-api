import {
	any,
	array,
	boolean,
	InferOutput,
	integer,
	maxLength,
	minLength,
	minValue,
	number,
	object,
	optional,
	pipe,
	picklist,
	regex,
	string,
	transform
} from 'valibot';
import { ERROR_VALIDATION_MSG } from '@/libs/config/errorMessage';

export const VALID_USER_LEVELS = [
	'SUPERADMIN',
	'ADMIN',
	'QA',
	'IMPLEMENTOR',
	'VIEWER'
] as const;

export type TUserLevel = (typeof VALID_USER_LEVELS)[number];

const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const USERNAME_MSG = 'Username hanya boleh huruf, angka, titik, underscore, dan tanda hubung.';
const USER_ID_MSG = 'ID user tidak valid.';

const createUserValidation = object({
	nama: pipe(
		string(ERROR_VALIDATION_MSG.string('Nama lengkap')),
		minLength(2, ERROR_VALIDATION_MSG.minLength('Nama lengkap', 2)),
		maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama lengkap', 150))
	),
	username: pipe(
		string(ERROR_VALIDATION_MSG.string('Username')),
		minLength(3, ERROR_VALIDATION_MSG.minLength('Username', 3)),
		maxLength(50, ERROR_VALIDATION_MSG.maxLength('Username', 50)),
		regex(USERNAME_REGEX, USERNAME_MSG)
	),
	password: pipe(
		string(ERROR_VALIDATION_MSG.string('Password')),
		minLength(6, ERROR_VALIDATION_MSG.minLength('Password', 6))
	),
	level: picklist(VALID_USER_LEVELS, 'Level role tidak valid'),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif'))),
	project_ids: optional(array(number(ERROR_VALIDATION_MSG.number('ID Project'))))
});
export type TCreateUserValidation = InferOutput<typeof createUserValidation>;

const updateUserValidation = object({
	nama: optional(
		pipe(
			string(ERROR_VALIDATION_MSG.string('Nama lengkap')),
			minLength(2, ERROR_VALIDATION_MSG.minLength('Nama lengkap', 2)),
			maxLength(150, ERROR_VALIDATION_MSG.maxLength('Nama lengkap', 150))
		)
	),
	level: optional(picklist(VALID_USER_LEVELS, 'Level role tidak valid')),
	is_active: optional(boolean(ERROR_VALIDATION_MSG.boolean('Status aktif'))),
	project_ids: optional(array(number(ERROR_VALIDATION_MSG.number('ID Project'))))
});
export type TUpdateUserValidation = InferOutput<typeof updateUserValidation>;

const resetPasswordValidation = object({
	password: pipe(
		string(ERROR_VALIDATION_MSG.string('Password')),
		minLength(6, ERROR_VALIDATION_MSG.minLength('Password', 6))
	)
});
export type TResetPasswordValidation = InferOutput<typeof resetPasswordValidation>;

const userIdParamValidation = object({
	id_user: pipe(
		string(ERROR_VALIDATION_MSG.string('ID user')),
		regex(/^\d+$/, USER_ID_MSG),
		transform((value) => Number(value)),
		integer(USER_ID_MSG),
		minValue(1, USER_ID_MSG)
	)
});
export type TUserIdParamValidation = InferOutput<typeof userIdParamValidation>;

const listUserValidation = object({
	page: optional(
		pipe(
			any(),
			transform((value) => (value === undefined || value === '' ? 0 : Number(value))),
			integer(ERROR_VALIDATION_MSG.number('Page')),
			minValue(0, ERROR_VALIDATION_MSG.minValue('Page', 0))
		)
	),
	perPage: optional(
		pipe(
			any(),
			transform((value) => (value === undefined || value === '' ? 20 : Number(value))),
			integer(ERROR_VALIDATION_MSG.number('Per Page')),
			minValue(1, ERROR_VALIDATION_MSG.minValue('Per Page', 1))
		)
	),
	search: optional(
		pipe(string(ERROR_VALIDATION_MSG.string('Pencarian')), maxLength(100, ERROR_VALIDATION_MSG.maxLength('Pencarian', 100)))
	),
	level: optional(picklist(['all', ...VALID_USER_LEVELS])),
	is_active: optional(picklist(['all', 'true', 'false']))
});
export type TListUserValidation = InferOutput<typeof listUserValidation>;

export default {
	createUserValidation,
	updateUserValidation,
	resetPasswordValidation,
	userIdParamValidation,
	listUserValidation
};
