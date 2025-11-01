import { getBookingFromRedis, getDriversFromRedis, getRidesFromRedis, getRidesFromRedisByDriver, updateBookingInRedis } from "@/utils/redisHelper";
import { getRedis } from "../redis/redis.plugin";
import bookingChatModel from "@/modules/ride-bookings/models/bookingChatModel";
import { sendToDriverPushNotification } from "@/modules/drivers/controllers/admin/pushnotification.controller";
import { sendToCustomerPushNotification } from "@/modules/users/controllers/user-app/pushnotification.controller";
import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import {
  sendSocket,
  sendToAllUsers,
  sendToDriverSocket,
  sendToUserSocket,
  Sockets,
  userSockets,
} from "./websocket.plugin";
import usersModel from "@/modules/users/models/users.model";
import driversModel from "@/modules/drivers/models/drivers.model";

export default async function messageHandler(ws: any, message: any) {
  const redis = getRedis();
  switch (message.event) {
    case "ADMIN_REQUEST_DRIVERS_LIST":
      let drivers: any = [];
      if (redis) {
        const driversRawData = await getDriversFromRedis()
        drivers = driversRawData?.map((b: any, i: number) => ({
          ...b,
          _id: b?._id || Bun.randomUUIDv7(),
        }));
      }

      ws.send(JSON.stringify({ event: "ADMIN_DRIVERS_LIST", data: drivers }));
      break;

    case "ADMIN_REQUEST_RIDES_LIST":
      let rides: any = [];
      if (redis) {
        rides = await getRidesFromRedis({
          tripStatus: [
            bookingStatus.finding_driver,
            bookingStatus.ontheway,
            bookingStatus.arrived,
            bookingStatus.picked,
          ],
        });
      }
      rides = rides?.map((b: any) => ({
        _id: b?._id || Bun.randomUUIDv7(),
        orderNo: b?.orderNo,
        otp: b?.otp,
        scheduledAt: b?.scheduled?.scheduledAt,
        createdAt: b?.createdAt,
        grandTotal: b?.grandTotal,
        tripStatus: b?.tripStatus
      }));
      ws.send(JSON.stringify({ event: "ADMIN_RIDES_LIST", data: rides }));
      break;

    case "routeProgressChange": {
      const routeProgress = message.data;

      let bookingDetails = await getBookingFromRedis(routeProgress?.bookingId);
      const driverId = bookingDetails?.driver?._id || bookingDetails?.driver || null;
      let allDriverBookings: any[] = [];
      if (driverId) {
        allDriverBookings = await getRidesFromRedisByDriver(driverId);
      }
      const pickedBooking = allDriverBookings.find(b => b.tripStatus === "picked");

      const routeProgressChange: any = await rideBookingsModel
        .findOne({ _id: routeProgress?.bookingId })
        .populate("driver customer")
        .lean();

      try {

        if (routeProgress?.bookingId) {

          let timeDetails = {
            km: parseFloat((routeProgress?.distanceRemaining / 1000).toFixed(1)),
            kmText: `${(routeProgress?.distanceRemaining / 1000).toFixed(1)} km`,
            durationText: `${Math.round(routeProgress?.durationRemaining / 60)} mins ${Math.abs(Math.round(routeProgress?.durationRemaining % 60))} secs`,
            duration: Math.round(routeProgress?.durationRemaining / 60),
          };
          if (allDriverBookings?.length > 1 && pickedBooking?._id) {
            await updateBookingInRedis(pickedBooking?._id, {
              driverRouteProgress: timeDetails,
              timingLastUpdated: new Date()
            });

          }
          else {
            await updateBookingInRedis(routeProgress?.bookingId, {
              driverRouteProgress: timeDetails,
              timingLastUpdated: new Date()
            });
          }


        }
      } catch (err: any) {
        console.log('Failed to update booking route progress in Redis', err?.message || err);
      }

      sendToUserSocket(routeProgressChange?.customer?._id.toString(), {
        event: "routeProgressChange",
        data: { ...routeProgress }
      });

      if (
        [bookingStatus.ontheway, bookingStatus.arrived].includes(routeProgressChange?.tripStatus) &&
        routeProgress?.durationRemaining < 125
      ) {
        const updated: any = await rideBookingsModel.findOneAndUpdate(
          {
            _id: routeProgress?.bookingId,
            nearByNotification: { $ne: true },
          },
          { $set: { nearByNotification: true } },
          { new: true }
        ).populate("customer");
        if (updated) {
          sendToCustomerPushNotification(
            updated.customer?._id.toString(),
            {
              notification: {
                title: `Your driver is almost there.`,
                body: `Your driver is arriving soon and will wait for 2 minutes before departing. Be ready`,
              },
              data: {
                notificationType: "routeProgressChange",
                bookingId: routeProgress?.bookingId,
              },
            }
          );
        }
      }
      break;
    }

    case "routeReady": {
      const payload = message.data;
      if (!payload?.bookingId || !payload?.routeString || typeof payload.routeString?.polyline === "undefined") break;
      try {
        let bookingDetails = await getBookingFromRedis(payload.bookingId);
        if (!bookingDetails || bookingDetails?.driverRouteString === payload?.routeString?.polyline) {
          break;
        }
        await updateBookingInRedis(payload.bookingId, {
          driverRouteString: payload?.routeString?.polyline,
        });
        // await rideBookingsModel.updateOne(
        //   { _id: payload.bookingId },
        //   { driverRouteString: payload.routeString?.polyline }
        // );
      } catch (e) { }
      break;
    }

    case "usernoshow": {
      const payload = message.data;
      if (!payload?.bookingId) break;

      let bookingDetails = await getBookingFromRedis(payload.bookingId);
      try {
        await updateBookingInRedis(payload.bookingId, {
          noShowSmsCall: true,
        });
        await rideBookingsModel.updateOne(
          { _id: payload.bookingId },
          { noShowSmsCall: true, forceUpdateInDB: true }
        );
        sendToDriverPushNotification(
          bookingDetails?.driver?._id || bookingDetails?.driver,
          {
            notification: {
              title: `You are eligible for no show cancellation`,
              body: "",
            },
            data: {
              notificationType: "noShowNotification",
              bookingId: payload.bookingId || "",
            },
          }
        );
      } catch (e) { }
      break;
    }

    case "updateDriverLoc": {
      const updateCurrentLocation = message.data;
      if (!updateCurrentLocation?.location?.coordinates) {
        return;
      }

      let updateData: any = {
        location: updateCurrentLocation?.location,
      };

      if (typeof updateCurrentLocation.heading !== "undefined") {
        updateData.heading = updateCurrentLocation.heading;
      }

      sendToAllUsers("DriverLocationUpdate", {
        driverId: updateCurrentLocation.driverId,
        ...updateData,
      });
      break;
    }

    case "SendMessageCabBookingChat":
      const chatPayload = message.data;
      let activeBooking: any = await getBookingFromRedis(chatPayload.chat);
      let _id = Bun.randomUUIDv7();

      if (activeBooking) {
        // Use ws.publish for channel-based broadcasting
        ws.publish(
          `driver-${activeBooking?.driver?._id.toString()}`,
          JSON.stringify({
            event: "ReadCabBookingMsg",
            data: { ...chatPayload, _id },
          })
        );
        ws.publish(
          `user-${activeBooking?.customer?._id.toString()}`,
          JSON.stringify({
            event: "ReadCabBookingMsg",
            data: { ...chatPayload, _id },
          })
        );
        ws.send(
          JSON.stringify({
            event: "ReadCabBookingMsg",
            data: { ...chatPayload, _id },
          })
        );
      }

      await bookingChatModel.create(chatPayload);

      if (chatPayload?.sender?.driver == null) {
        sendToDriverPushNotification(chatPayload.notifiTo, {
          notification: {
            title: `New message from customer`,
            body: chatPayload?.content || "",
          },
          data: {
            notificationType: "bookingChatMsg",
            bookingId: chatPayload?.chat || "",
          },
        });
      } else {
        sendToCustomerPushNotification(chatPayload.notifiTo, {
          notification: {
            title: `New message from driver`,
            body: chatPayload?.content || "",
          },
          data: {
            notificationType: "bookingChatMsg",
            bookingId: chatPayload?.chat || "",
          },
        });
      }
      break;

    case "voiceCallConnected":
      const payload = message.data;
      const bookingDetails: any = await rideBookingsModel
        .findOne({ _id: payload?.bookingId })
        .populate("driver customer")
        .lean();

      if (payload?.to === "driver") {
        // sendSocket(
        //   [bookingDetails?.driver?._id.toString()],
        //   "voiceCallConnected",
        //   { bookingId: payload.bookingId }
        // );
        sendToDriverSocket(bookingDetails?.driver?._id.toString(), {
          event: "voiceCallConnected",
          data: { bookingId: payload.bookingId }
        })
      } else {
        // sendSocket(
        //   [disconnectCall?.customer?._id.toString()],
        //   "voiceCallConnected",
        //   { bookingId: payload.bookingId }
        // );
        sendToUserSocket(bookingDetails?.customer?._id.toString(), {
          event: "voiceCallConnected",
          data: {
            bookingId: payload.bookingId
          }
        })
      }

      if (payload?.to == "driver") {
        sendToDriverPushNotification(payload.notifiTo, {
          notification: {
            title: `Receiving Call from user`,
            body: payload?.content || "",
          },
          data: {
            notificationType: "bookingCall",
            bookingId: payload?.chat || "",
          },
        });
      } else {
        sendToCustomerPushNotification(payload.notifiTo, {
          notification: {
            title: `Receiving Call from Driver`,
            body: payload?.content || "",
          },
          data: {
            notificationType: "bookingCall",
            bookingId: payload?.chat || "",
          },
        });
      }
      break;

    case "voiceCallDisConnected":
      const payloadDisconnect = message.data;
      const disconnectCall: any = await rideBookingsModel
        .findOne({ _id: payloadDisconnect?.bookingId })
        .populate("driver customer")
        .lean();

      if (payloadDisconnect?.to === "driver") {
        // sendSocket(
        //   [disconnectCall?.driver?._id.toString()],
        //   "voiceCallDisConnected",
        //   { bookingId: payloadDisconnect.bookingId }
        // );
        sendToDriverSocket(disconnectCall?.driver?._id.toString(), {
          event: "voiceCallDisConnected",
          data: { bookingId: payloadDisconnect.bookingId }
        })
      } else {
        // sendSocket(
        //   [disconnectCall?.customer?._id.toString()],
        //   "voiceCallDisConnected",
        //   { bookingId: payloadDisconnect.bookingId }
        // );
        sendToUserSocket(disconnectCall?.customer?._id.toString(), {
          event: "voiceCallDisConnected",
          data: {
            bookingId: payloadDisconnect.bookingId
          }
        })
      }

      if (payloadDisconnect?.to == "driver") {
        sendToDriverPushNotification(payloadDisconnect.notifiTo, {
          notification: {
            title: `Disconnected Call from user`,
            body: payloadDisconnect?.content || "",
          },
          data: {
            notificationType: "bookingCall",
            bookingId: payloadDisconnect?.chat || "",
          },
        });
      } else {
        sendToCustomerPushNotification(payloadDisconnect.notifiTo, {
          notification: {
            title: `Disconnected Call from driver`,
            body: payloadDisconnect?.content || "",
          },
          data: {
            notificationType: "bookingCall",
            bookingId: payloadDisconnect?.chat || "",
          },
        });
      }
      break;

    case "registerUser":
      const { userId, driverId } = message.data;

      if (userId) {
        Sockets.set(userId, ws);
        userSockets.set(userId, ws);

        if (!ws.isSubscribed(`user-${userId}`)) {
          ws.subscribe(`user-${userId}`);
        }

        await usersModel.findOneAndUpdate(
          { _id: userId },
          { socket_id: userId }
        );
      }

      if (driverId) {
        Sockets.set(driverId, ws);

        if (!ws.isSubscribed(`driver-${driverId}`)) {
          ws.subscribe(`driver-${driverId}`);
        }

        await driversModel.findOneAndUpdate(
          { _id: driverId },
          {
            socket_id: driverId,
            missedBookingCount: 0,
            missedBookingAt: null,
          }
        );
      }

      break;

    default:
      ws.send(JSON.stringify({ event: "error", message: "Unknown event" }));
      break;
  }
}
