import rideBookingsModel, { bookingStatus } from '@/modules/ride-bookings/models/rideBookings.model';
import { getDriversLocations } from '@/modules/drivers/controllers/admin/drivers.controller';
import driversModel from '@/modules/drivers/models/drivers.model';
import usersModel from '@/modules/users/models/users.model';
import { Elysia, t } from 'elysia';
import { sendToDriverPushNotification } from '@/modules/drivers/controllers/admin/pushnotification.controller';
import { sendToCustomerPushNotification } from '@/modules/users/controllers/user-app/pushnotification.controller';
import { getuserSocketId } from './fetchSocketId';
import { generateRandomString } from '.';
import bookingChatModel from '@/modules/ride-bookings/models/bookingChatModel';

const clients: Set<WebSocket> = new Set();
export const Sockets: any = new Map<string, WebSocket>();
export const userSockets: any = new Map<string, WebSocket>();
export const websocket = new Elysia()

export function sendSocket(userIds: string | string[], event: string, data: any) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    ids.forEach((userId) => {
        try {
            const socket = Sockets.get(userId);
            if (socket && socket?.raw?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ event, data }));
            }
        } catch (err) {
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

websocket.ws('/ws', {
    query: t.Object({
        userId: t.Optional(t.String()),
        driverId: t.Optional(t.String()),
    }),

    open: async (ws: any) => {
        const { userId, driverId } = ws.data.query;

        clients.add(ws);

        if (userId) {
            Sockets.set(userId, ws);
            userSockets.set(userId, ws);
        };

        if (driverId) {
            Sockets.set(driverId, ws)
        };

        if (driverId) {
            await driversModel.findOneAndUpdate({ _id: driverId }, {
                socket_id: driverId,
                missedBookingCount: 0,
                missedBookingAt: null,
            })
        }

        if (userId) {
            await usersModel.findOneAndUpdate({ _id: userId }, { socket_id: userId })
        }

        ws.send(
            JSON.stringify({
                event: 'welcome',
                message: 'Connected to WebSocket server!',
            })
        );
    },

    message: async (ws: any, message: any) => {
        try {

            if (typeof message == 'string') {
                message = JSON.parse(message);
            }

            switch (message.event) {
                case 'routeProgressChange':
                    const routeProgress = message.data;
                    const routeProgressChange: any = await rideBookingsModel.findOne({ _id: routeProgress?.bookingId }).populate("driver customer").lean()
                    sendSocket([routeProgressChange?.customer?._id?.toString()], "routeProgressChange", { ...routeProgress })
                    if (!routeProgressChange?.nearByNotification && [bookingStatus.ontheway, bookingStatus.arrived].includes(routeProgressChange?.tripStatus) && routeProgress?.durationRemaining < 125) {
                        await rideBookingsModel.updateOne(
                            { _id: routeProgress?.bookingId },
                            { nearByNotification: true },
                        )
                        sendToCustomerPushNotification(routeProgressChange?.customer?._id?.toString(), {
                            notification: {
                                title: `Your driver is almost there.`,
                                body: `Your driver is arriving soon and will wait for 2 minutes before departing. Be ready`,
                            },
                            data: {
                                notificationType: "routeProgressChange",
                                bookingId: routeProgress?.bookingId,
                            },
                        });
                    }
                    break;

                case 'voiceCallConnected':
                    const payload = message.data;
                    const bookingDetails: any = await rideBookingsModel.findOne({ _id: payload?.bookingId }).populate("driver customer").lean()
                    if (payload?.to === "driver") {
                        sendSocket([bookingDetails?.driver?._id?.toString()], "voiceCallConnected", { bookingId: payload.bookingId, })
                    } else {
                        sendSocket([bookingDetails?.customer?._id?.toString()], "voiceCallConnected", { bookingId: payload.bookingId, })
                    }
                    if (payload?.to == "driver") {
                        sendToDriverPushNotification(payload.notifiTo, {
                            notification: {
                                title: `Recieving Call from user`,
                                body: payload?.content || ''
                            },
                            data: {
                                notificationType: 'bookingCall',
                                bookingId: payload?.chat || ''
                            }
                        })
                    } else {
                        sendToCustomerPushNotification(payload.notifiTo, {
                            notification: {
                                title: `Recieving Call from Driver`,
                                body: payload?.content || ''
                            },
                            data: {
                                notificationType: 'bookingCall',
                                bookingId: payload?.chat || ''
                            }
                        })
                    }
                    break;

                case 'voiceCallDisConnected':
                    const payloadDisconnect = message.data;
                    const disconnectCall: any = await rideBookingsModel.findOne({ _id: payloadDisconnect?.bookingId }).populate("driver customer").lean()
                    if (payloadDisconnect?.to === "driver") {
                        sendSocket([disconnectCall?.driver?._id?.toString()], "voiceCallDisConnected", { bookingId: payloadDisconnect.bookingId, })
                    } else {
                        sendSocket([disconnectCall?.customer?._id?.toString()], "voiceCallDisConnected", { bookingId: payloadDisconnect.bookingId, })
                    }
                    if (payloadDisconnect?.to == "driver") {
                        sendToDriverPushNotification(payloadDisconnect.notifiTo, {
                            notification: {
                                title: `Disconnected Call from user`,
                                body: payloadDisconnect?.content || ''
                            },
                            data: {
                                notificationType: 'bookingCall',
                                bookingId: payloadDisconnect?.chat || ''
                            }
                        })
                    } else {
                        sendToCustomerPushNotification(payloadDisconnect.notifiTo, {
                            notification: {
                                title: `Disconnected Call from driver`,
                                body: payloadDisconnect?.content || ''
                            },
                            data: {
                                notificationType: 'bookingCall',
                                bookingId: payloadDisconnect?.chat || ''
                            }
                        })
                    }
                    break;

                case 'updateDriverLoc':


                    const updateCurrentLocation = message.data;
                    if (!updateCurrentLocation?.location?.coordinates) {
                        return;
                    }
                    // let driverData = await driversModel.findOne({ _id: updateCurrentLocation?.driverId });

                    // if (driverData?.location?.coordinates[0] === updateCurrentLocation?.location?.coordinates[0] && driverData?.location?.coordinates[1] === updateCurrentLocation?.location?.coordinates[1]) {
                    //     return;
                    // }

                    let updateData: any = {
                        location: updateCurrentLocation?.location,
                    }

                    if (typeof updateCurrentLocation.heading != 'undefined') {
                        updateData.heading = updateCurrentLocation.heading
                    }

                    // await driversModel.updateOne(
                    //     { _id: updateCurrentLocation.driverId },
                    //     { ...updateData },
                    // )

                    sendToAllUsers("DriverLocationUpdate", {
                        driverId: updateCurrentLocation.driverId,
                        ...updateData,
                    })
                    break;

                case 'SendMessageCabBookingChat':
                    const chatPayload = message.data;
                    let activeBookingg: any = await rideBookingsModel.findOne({ _id: chatPayload.chat }).populate("driver customer").lean();
                    let _id = generateRandomString(8);
                    if (activeBookingg) {
                        sendSocket([activeBookingg?.driver?._id?.toString(), activeBookingg?.customer?._id.toString()], 'ReadCabBookingMsg', { ...chatPayload, _id });
                    }

                    await bookingChatModel.create(chatPayload);
                    if (chatPayload?.sender?.driver == null) {
                        sendToDriverPushNotification(chatPayload.notifiTo, {
                            notification: {
                                title: `New message from customer`,
                                body: chatPayload?.content || ''
                            },
                            data: {
                                notificationType: 'bookingChatMsg',
                                bookingId: chatPayload?.chat || ''
                            }
                        })
                    } else {
                        sendToCustomerPushNotification(chatPayload.notifiTo, {
                            notification: {
                                title: `New message from driver`,
                                body: chatPayload?.content || ''
                            },
                            data: {
                                notificationType: 'bookingChatMsg',
                                bookingId: chatPayload?.chat || ''
                            }
                        })
                    }
                    break;

                case 'getDriverLocations':
                    const locationsData = await getDriversLocations()
                    ws.send(JSON.stringify({ event: 'driversLocations', data: locationsData }));
                    break;

                default:
                    ws.send(JSON.stringify({ event: 'error', message: 'Unknown event' }));
                    break;
            }
        } catch (e) {
            ws.send(JSON.stringify({ event: 'error', message: 'Invalid JSON' }));
        }
    },

    close: async (ws: any) => {
        clients.delete(ws);
        const { userId, driverId } = ws.data.query;

        if (driverId) {
            for (const [id, socket] of Sockets.entries()) {
                if (driverId === id) {
                    Sockets.delete(driverId);
                    await driversModel.findOneAndUpdate({ _id: driverId }, { socket_id: "" })
                    break;
                }
            }
        }

        for (const [id, socket] of userSockets.entries()) {
            if (userId === id || driverId === id) {
                userSockets.delete(userId);
                await usersModel.findOneAndUpdate({ _id: userId }, { socket_id: "" })
                break;
            }
        }
    },
    error: (err) => {
    }
})