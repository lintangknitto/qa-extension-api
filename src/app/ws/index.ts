import { logger } from '@knittotextile/knitto-core-backend';
import { IncomingMessage, ServerResponse, Server } from 'http';
import { DefaultEventsMap, Socket, Server as SocketServer } from 'socket.io';

export const initSocketIO = (
	httpServer: Server<typeof IncomingMessage, typeof ServerResponse>
) => {
	const io = new SocketServer(httpServer, {
		cors: {
			origin: '*',
			methods: ['GET', 'POST', 'PUT', 'DELETE']
		},
		path: '/knitto-socket'
	});

	io.on('connection', handlingOnConnection);
};

export const handlingOnConnection = (
	socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) => {
	// handling connection socket io here
	logger.info(`New connection: ${socket.id}`);
};
