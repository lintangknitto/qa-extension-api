import mysqlConnection from '@/libs/config/mysqlConnection';
import { MySqlResultSetHeader } from '@knittotextile/knitto-mysql/dist/libs/MySqlConnector';

export const updateUserLogout = async (userId: number) => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		"UPDATE user SET status_login='FREE', ip_addres='' WHERE id_user=?",
		[userId]
	);
};

export const updatePrinterLogout = async (userId: number) => {
	await mysqlConnection.raw<MySqlResultSetHeader>(
		'UPDATE data_printer SET id_karyawan=0 WHERE id_karyawan=?',
		[userId]
	);
};
