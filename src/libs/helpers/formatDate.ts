type OptionDateFormat = 'YYMM';
export default function createDate(date: Date, opt: OptionDateFormat): string | undefined {
	if (opt === 'YYMM') {
		const year = date.getUTCFullYear() % 100;
		let month: string | number = date.getUTCMonth() + 1;
		if (month < 10) { month = `0${month}`; }
		return `${year}${month}`;
	}
	return undefined;
};
