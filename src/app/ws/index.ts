import { logger } from '@knittotextile/knitto-core-backend';
import { IncomingMessage, ServerResponse, Server } from 'http';
import { DefaultEventsMap, Socket, Server as SocketServer } from 'socket.io';
import {
	getSessionResumeUseCase,
	ingestEventsUseCase
} from '../http/recording/use-case/ingest-events.use-case';
import { decodeSocketToken, extractSocketToken, loadUserForSocket, type ISocketUser } from './socket-auth';
import { toSafeSocketErrorMessage } from './socket-error';

type TRecordingSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, { user?: ISocketUser }>;
type TAck = (response: unknown) => void;

export const SESSION_ROOM = (idSession: number): string => `recording:session:${idSession}`;

let ioInstance: SocketServer | null = null;

export const getSocketIO = (): SocketServer | null => ioInstance;

export const emitGenerationStarted = (idSession: number, kind: string): void => {
	if (!ioInstance) return;
	try {
		ioInstance.to(SESSION_ROOM(idSession)).emit('generation:started', { idSession, kind });
		ioInstance.emit('generation:started', { idSession, kind });
	} catch (err) {
		logger.warn(`Gagal emit generation:started: ${(err as Error).message}`);
	}
};

export const emitGenerationCompleted = (idSession: number, kind: string, output?: string): void => {
	if (!ioInstance) return;
	try {
		ioInstance.to(SESSION_ROOM(idSession)).emit('generation:completed', { idSession, kind, output });
		ioInstance.emit('generation:completed', { idSession, kind, output });
	} catch (err) {
		logger.warn(`Gagal emit generation:completed: ${(err as Error).message}`);
	}
};

export const emitGenerationFailed = (idSession: number, kind: string, error?: string): void => {
	if (!ioInstance) return;
	try {
		ioInstance.to(SESSION_ROOM(idSession)).emit('generation:failed', { idSession, kind, error });
		ioInstance.emit('generation:failed', { idSession, kind, error });
	} catch (err) {
		logger.warn(`Gagal emit generation:failed: ${(err as Error).message}`);
	}
};

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
	ioInstance = io;

	// Handshake wajib membawa JWT valid; user dimuat ulang agar token lama yang
	// usernya sudah dihapus tidak bisa dipakai.
	io.use(async (socket, next) => {
		try {
			const token = extractSocketToken(socket.handshake);
			if (!token) return next(new Error('unauthorized'));

			const { id_user } = decodeSocketToken(token);
			const user = await loadUserForSocket(id_user);
			if (!user) return next(new Error('unauthorized'));

			(socket.data as { user?: ISocketUser }).user = user;
			next();
		} catch {
			next(new Error('unauthorized'));
		}
	});

	io.on('connection', (socket) => handlingOnConnection(socket as TRecordingSocket));
};

export const handlingOnConnection = (socket: TRecordingSocket) => {
	const user = socket.data.user;
	if (!user) {
		socket.disconnect(true);
		return;
	}

	logger.info(`New recording connection: ${socket.id} (user ${user.id_user})`);

	socket.on('recording:join', async (payload: { id_session?: unknown }, ack?: TAck) => {
		try {
			const idSession = Number(payload?.id_session);
			const result = await getSessionResumeUseCase({
				idSession,
				userId: user.id_user,
				userLevel: user.level
			});
			await socket.join(SESSION_ROOM(idSession));
			ack?.({ ok: true, result });
		} catch (error) {
			logger.error(`recording:join gagal: ${(error as Error).message}`);
			ack?.({ ok: false, error: toSafeSocketErrorMessage(error) });
		}
	});

	socket.on(
		'recording:events',
		async (payload: { id_session?: unknown; events?: unknown }, ack?: TAck) => {
			try {
				const idSession = Number(payload?.id_session);
				const result = await ingestEventsUseCase({
					idSession,
					userId: user.id_user,
					userLevel: user.level,
					rawEvents: payload?.events
				});
				ack?.({ ok: true, result });
			} catch (error) {
				logger.error(`recording:events gagal: ${(error as Error).message}`);
				ack?.({ ok: false, error: toSafeSocketErrorMessage(error) });
			}
		}
	);
};
