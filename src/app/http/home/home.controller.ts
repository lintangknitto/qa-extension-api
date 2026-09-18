import { TRequestFunction } from '@knittotextile/knitto-http';
import { APP_NAME, APP_VERSION } from '@/libs/config';

const home: TRequestFunction = async () => {
	const result = { APP_NAME, APP_VERSION };
	return {
		result
	};
};

export default {
	home
};
