interface IGuestPathCfg {
	path: string
	/**
	 * set true jika ingin bypass pengecekan auth terhadap semua subpath nya
	 */
	withSubPath?: boolean

	/**
	 * list method yang di bypass, set array kosong jika berlaku ke semua method
	 */
	method: Array<'get' | 'post' | 'put' | 'delete' | 'patch'>
}

/**
 * List endpoint yang akan dilewati proses pengecekan auth jwt
 */
const guestPath: IGuestPathCfg[] = [
	{
		path: '/socket.io',
		withSubPath: true,
		method: []
	},
	{
		path: '/api-docs',
		withSubPath: true,
		method: []
	},
	{
		path: '/auth/login',
		method: ['post']
	},
	{
		path: '/',
		method: ['get']
	}
];

export default guestPath;
