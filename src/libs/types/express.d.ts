declare namespace Express {
	export interface Request {
		userId?: number
		userData?: {
			id_user: number;
			username: string;
			nama: string;
			level: string;
		}
		isGuest?: boolean;
	}
}
