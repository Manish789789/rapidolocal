import { Elysia, t } from 'elysia';
import driversModel from '@/modules/drivers/models/drivers.model';
import usersModel from '@/modules/users/models/users.model';
import messageHandler from './message.handler'; // Import your message handler
import { logger } from '@/utils/logger';

// Store socket connections
const wsInstance = new Map<string, any>();
export const Sockets: any = new Map<string, WebSocket>();
export const userSockets: any = new Map<string, WebSocket>();
interface socketSendEvent {
    event: string,
    data: any
}


// Helper functions (export these so they're available in message.handler)
export function sendSocket(userIds: string | string[], event: string, data: any) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    ids.forEach((userId) => {
        try {
            const socket = Sockets.get(userId);
            if (socket && socket?.raw?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ event, data }));
            }
        } catch (e: any) {
            logger.error({ error: e, msg: e.message });
        }
    });
}

export function sendToAll(event: string, data: any) {
    const message = JSON.stringify({ event, data });
    for (const [userId, socket] of Sockets.entries()) {
        if (userId && socket?.raw?.readyState === WebSocket.OPEN) {
            socket.send(message);
        }
    }
}

export function sendToAllUsers(event: string, data: any) {
    const message = JSON.stringify({ event, data });
    for (const [userId, socket] of userSockets.entries()) {
        if (userId && socket?.raw?.readyState === WebSocket.OPEN) {
            socket.send(message);
        }
    }
}

// WebSocket plugin
export const websocketPlugin = new Elysia({ name: 'websocket' })
    .decorate('ws', wsInstance)
    .ws('/ws', {
        query: t.Object({
            userId: t.Optional(t.String()),
            driverId: t.Optional(t.String()),
        }),

        async open(ws) {
            const { userId, driverId } = ws.data.query;

            // Store socket in Maps
            if (userId) {
                Sockets.set(userId, ws);
                userSockets.set(userId, ws);
            }

            if (driverId) {
                Sockets.set(driverId, ws);
            }

            if (driverId && !ws.isSubscribed(`driver-${driverId}`)) {
                ws.subscribe(`driver-${driverId}`);
            }
            else if (userId && !ws.isSubscribed(`user-${userId}`)) {
                ws.subscribe(`user-${userId}`);
            }
            else if (!ws.isSubscribed(`admin-group`)) {
                ws.subscribe(`admin-group`);
            }

            if (driverId) {
                driversModel.updateOne({ _id: driverId }, {
                    socket_id: driverId,
                    missedBookingCount: 0,
                    missedBookingAt: null,
                }).exec();
            }

            if (userId) {
                usersModel.updateOne({ _id: userId }, { socket_id: userId }).exec();
            }

            wsInstance.set('global', ws);

            ws.send(JSON.stringify({
                event: 'welcome',
                message: 'Connected to WebSocket server!',
            }));
        },

        async message(ws, message: any) {
            try {
                await messageHandler(ws, message);
            } catch (e: any) {
                logger.error({ error: e, msg: e.message });
                ws.send(JSON.stringify({ event: 'error', message: 'Invalid JSON or processing error' }));
            }
        },

        async close(ws) {
            const { userId, driverId } = ws.data.query;

            // Properly clean up all socket references
            if (driverId) {
                // Remove from all socket maps
                Sockets.delete(driverId);
                userSockets.delete(driverId);

                // Unsubscribe from channels
                if (ws.isSubscribed(`driver-${driverId}`)) {
                    ws.unsubscribe(`driver-${driverId}`);
                }

                // Update database
                driversModel.updateOne({ _id: driverId }, { socket_id: "" }).exec();
            }

            if (userId) {
                // Remove from all socket maps
                Sockets.delete(userId);
                userSockets.delete(userId);

                // Unsubscribe from channels
                if (ws.isSubscribed(`user-${userId}`)) {
                    ws.unsubscribe(`user-${userId}`);
                }

                // Update database
                usersModel.updateOne({ _id: userId }, { socket_id: "" }).exec();
            }

            // Unsubscribe from admin group if subscribed
            if (ws.isSubscribed(`admin-group`)) {
                ws.unsubscribe(`admin-group`);
            }

            // Only delete global if this is the last connection
            // Consider using a counter or better logic here
            wsInstance.delete('global');
        },
        error(e: any) {
            logger.error({ error: e, msg: e.message });
        }
    });

export const sendToDriverSocket = async (driverId: string, data: socketSendEvent) => {
    try {
        const ws = wsInstance.get('global');
        if (ws) {
            if (ws.data.query.driverId === driverId?.toString()) {
                ws.send(JSON.stringify(data))
            } else {
                ws.publish(`driver-${driverId}`, JSON.stringify(data));
            }
        }
    } catch (error: any) {
        logger.error({ error: error, msg: error.message });
    }
}

export const sendToUserSocket = async (userId: string, data: socketSendEvent) => {
    try {
        const ws = wsInstance.get('global');
        if (ws) {
            if (ws.data.query.userId === userId?.toString()) {
                ws.send(JSON.stringify(data))
            } else {
                ws.publish(`user-${userId}`, JSON.stringify(data));
            }
        }
    } catch (error: any) {
        logger.error({ error: error, msg: error.message });
    }
}

export { wsInstance };