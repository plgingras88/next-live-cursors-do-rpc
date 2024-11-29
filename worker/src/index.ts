import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

export type WsMessage =
	| { type: 'message'; data: string }
	| { type: 'quit'; id: string }
	| { type: 'join'; id: string }
	| { type: 'move'; id: string; x: number; y: number }
	| { type: 'get-cursors' }
	| { type: 'get-cursors-response'; sessions: Session[] };

export type Session = { id: string; x: number; y: number };

export class CursorSessions extends DurableObject<Env> {
	sessions: Map<WebSocket, Session>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sessions = new Map();
		this.ctx.getWebSockets().forEach((ws) => {
			const meta = ws.deserializeAttachment();
			this.sessions.set(ws, { ...meta });
		});
	}

	broadcast(message: WsMessage, self?: string) {
		this.ctx.getWebSockets().forEach((ws) => {
			const { id } = ws.deserializeAttachment();
			if (id !== self) ws.send(JSON.stringify(message));
		});
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);
		this.ctx.acceptWebSocket(server);
		const id = url.searchParams.get('id');
		if (!id) {
			return new Response('Missing id', { status: 400 });
		}

		// Set Id and Default Position
		const sessionInitialData: Session = { id, x: -1, y: -1 };
		server.serializeAttachment(sessionInitialData);
		this.sessions.set(server, sessionInitialData);
		this.broadcast({ type: 'join', id }, id);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string) {
		if (typeof message !== 'string') return;
		let parsedMsg: WsMessage = JSON.parse(message);

		const session = this.sessions.get(ws);
		if (!session) return;

		switch (parsedMsg.type) {
			case 'move':
				session.x = parsedMsg.x;
				session.y = parsedMsg.y;
				ws.serializeAttachment(session);
				this.broadcast(parsedMsg, session.id);
				break;
			case 'get-cursors':
				const sessions: Session[] = [];
				this.sessions.forEach((session) => {
					sessions.push(session);
				});
				const wsMessage: WsMessage = { type: 'get-cursors-response', sessions };
				ws.send(JSON.stringify(wsMessage));
				break;

			case 'message':
				parsedMsg.data = `${parsedMsg.data} to ${this.sessions.size} clients`;
				this.broadcast(parsedMsg);
				break;
			default:
				break;
		}
	}

	async webSocketClose(ws: WebSocket, code: number) {
		const id = this.sessions.get(ws)?.id;
		ws.close();
		this.sessions.delete(ws);
		id && this.broadcast({ type: 'quit', id });
	}

	closeSessions() {
		this.ctx.getWebSockets().forEach((ws) => ws.close());
	}
}

/**
 * We need this because Durable Object RPC isn't yet supported in
 * multiple `wrangler dev` sessions.
 * On production, Durable Object RPC isn't an issue.
 */
export class SessionsRPC extends WorkerEntrypoint<Env> {
	async closeSessions() {
		const id = this.env.CURSOR_SESSIONS.idFromName('globalRoom');
		const stub = this.env.CURSOR_SESSIONS.get(id);
		await stub.closeSessions();
	}
}

export default {
	async fetch(request, env, ctx) {
		if (request.url.match('/ws')) {
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				return new Response('Durable Object expected Upgrade: websocket', { status: 426 });
			}
			const id = env.CURSOR_SESSIONS.idFromName('globalRoom');
			const stub = env.CURSOR_SESSIONS.get(id);
			return stub.fetch(request);
		}
		return new Response(null, {
			status: 400,
			statusText: 'Bad Request',
			headers: {
				'Content-Type': 'text/plain',
			},
		});
	},
} satisfies ExportedHandler<Env>;
