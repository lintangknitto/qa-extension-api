declare namespace listenerQueue {
	interface EventMessageData {
		id: number // ?: epoch number
		eventName: string
		data: any
	}
};
