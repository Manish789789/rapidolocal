import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import driversModel from "../../models/drivers.model";
import { sendToDriverPushNotification } from "./pushnotification.controller";
import mongoose from "mongoose";
import {
  getDirections,
  getDirectionsDistanceTime,
  getDistanceTime,
  getLatLongFromPolyline,
  getNearByDrivers,
  getOptimizedRoute,
} from "@/utils/map/mapboxHelper";
import { logger } from "@/utils/logger";
import * as turf from "@turf/turf";
import {
  findDriverFromRedis,
  getPriorityDrivers,
  matchJobExpiryTime,
  missedBookingCountForOffline,
  oneByOneJobBeforeMatchTiming,
  oneByOneJobExpiryTime,
  processJobToNextBeforeTimeDelay,
} from "@/utils/constant";
import { sendToCustomerPushNotification } from "@/modules/users/controllers/user-app/pushnotification.controller";
import { cancelledPayment } from "@/modules/paymentGateways/stripe.controller";
import { squareCancelPayment } from "@/modules/paymentGateways/square.controller";
import { surgeCompleteProcessForSingleZone } from "@/modules/ride-bookings/controllers/helpers/surge.controller";
import { sendSocket, sendToAllUsers } from "@/utils/websocket";
import pricingForUserModel from "@/modules/pricing/models/pricingForUser.model";
import { acquireDriverLock, acquireJobLock, calculateActiveBookingInRedis, deleteMatchNotification, findBusyDriversFromRedis, getActiveBookingCountOnThewayArrivedFromRedis, getBookingFromRedis, getBookingListOnTheWayFromRedis, getDriversFromRedis, getEligibleNearBookingsInRedis, getNearbyDriversFromRedis, getNearestBookingInRedis, getOrderListOfPoolFromRedis, getOrderListOnTheWayFromRedis, getPickedBookingsForDriverFromRedis, getRidesFromRedis, getSamePoolJobsFromRedis, idExistSaveDriverNotification, isAnyOtherActiveBookingInRedis, isBookingRequestAlreadySentToDriver, releaseDriverLock, renameKeyInRedis, saveDriverMatchNotification, saveDriverNotification, updateBookingInRedis, updateBookingWithKeyRename } from "@/utils/redisHelper";
import usersModel from "@/modules/users/models/users.model";
import { sendToDriverSocket, sendToUserSocket } from "@/plugins/websocket/websocket.plugin";
let isProcessing = false;

export const findNearDriverForAllWebsitesFromRedis = async () => {
  let driverList = await driversModel.find({
    missedBookingCount: { $gte: missedBookingCountForOffline },
    missedBookingAt: {
      $lt: new Date(new Date().getTime() - oneByOneJobExpiryTime),
    },
    iAmBusy: false,
    iAmOnline: true,
  }).select("_id").lean();

  await driversModel.updateMany(
    {
      missedBookingCount: { $gte: missedBookingCountForOffline },
      missedBookingAt: {
        $lt: new Date(new Date().getTime() - oneByOneJobExpiryTime),
      },
      iAmBusy: false,
      iAmOnline: true,
    },
    {
      iAmOnline: false,
      missedBookingCount: 0,
      missedBookingAt: null,
    }
  );

  for (const element of driverList) {
    sendToDriverPushNotification(String(element._id), {
      notification: {
        title: `Are you still online?`,
        body: "Stay available by reopening the app.",
      },
      data: {
        notificationType: "makingOffline",
      },
    });
  }
  let orderListOnTheWay: any = await getBookingListOnTheWayFromRedis()

  for (let order of orderListOnTheWay) {
    if (new Date(Date.now() + 60 * 60 * 1000) >= new Date(order.scheduled?.scheduledAt)) {
      if (!order.scheduled.OneHourBeforeNotification) {
        await updateBookingInRedis(order?._id, {
          "scheduled.OneHourBeforeNotification": true,
        });
        if (order?.driver?._id) {
          sendToDriverPushNotification(String(order.driver?._id), {
            notification: {
              title: `Be available for your schedule booking`,
              body: "You have schedule booking 1 hour later from now",
            },
            data: {
              notificationType: "ride_reminder",
              bookingId: order?._id?.toString(),
            },
          });

        }
      }
    }
    if (new Date(Date.now() + 45 * 60 * 1000) >= new Date(order.scheduled?.scheduledAt)) {
      if (!order.scheduled.fourtyFiveBeforeNotification) {
        await updateBookingInRedis(order?._id, {
          "scheduled.fourtyFiveBeforeNotification": true,
        });
        if (order?.driver?._id) {
          sendToDriverPushNotification(String(order.driver?._id), {
            notification: {
              title: `Be available for your schedule booking`,
              body: "You have schedule booking 45 minutes later from now",
            },
            data: {
              notificationType: "ride_reminder",
              bookingId: order?._id?.toString(),
            },
          });
        }
      }
    }
    if (new Date(Date.now() + 15 * 60 * 1000) >= new Date(order.scheduled?.scheduledAt)) {
      if (!order.scheduled.fifteenBeforeNotification) {
        await updateBookingInRedis(order?._id, {
          "scheduled.fifteenBeforeNotification": true,
        });
        if (order?.driver?._id) {
          sendToDriverPushNotification(String(order.driver._id), {
            notification: {
              title: `Be available for your schedule booking`,
              body: "You have schedule booking 15 minutes later from now",
            },
            data: {
              notificationType: "ride_reminder",
              bookingId: order?._id?.toString(),
            },
          });
        }
      }
    }
    if (new Date(Date.now() + 5 * 60 * 1000) >= new Date(order.scheduled?.scheduledAt)) {
      if (!order.scheduled.fiveBeforeNotification) {
        await updateBookingInRedis(order?._id, {
          "scheduled.fiveBeforeNotification": true,
        });
        if (order?.driver?._id) {
          sendToCustomerPushNotification(String(order.driver._id), {
            notification: {
              title: `Be available for your schedule booking`,
              body: "You ride are 5 minutes later from now",
            },
            data: {
              notificationType: "ride_reminder",
              bookingId: order?._id?.toString(),
            },
          });
        }
      }
    }
    if (new Date(Date.now()) >= new Date(order.scheduled?.scheduledAt)) {
      if (!order.scheduled.startRide) {
        await updateBookingInRedis(order?._id, {
          tripStatus: bookingStatus.canceled,
          canceledBy: "automatic",
          canceledReason: "driver not moving",
          cancelledAt: new Date(),
        });
        if (order?.paymentIntentId?.includes("pi_")) {
          await cancelledPayment(order?.paymentIntentId || "");
        } else if (order?.paymentIntentId) {
          await squareCancelPayment(order?.paymentIntentId || "");
        }
        // sendSocket(
        //   order?.customer?._id?.toString(),
        //   "singlebookingStatusUpdated",
        //   { bookingId: order?._id }
        // );
        // sendSocket(
        //   order?.driver?._id?.toString(),
        //   "singlebookingStatusUpdated",
        //   { bookingId: order?._id }
        // );
        sendToDriverSocket(order?.driver?._id?.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: order?._id }
        })
        sendToUserSocket(order?.customer?._id?.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: order?._id }
        })
        sendToCustomerPushNotification(
          order?.customer?._id
            ? String(order?.customer?._id)
            : String(order?.customer),
          {
            notification: {
              title: `Your Scheduled Ride is cancelled due to driver unavailability`,
              body: "Do'not worry. You can book your ride again",
            },
            data: {
              notificationType: "ride_canceled",
              bookingId: order?._id?.toString(),
            },
          }
        );
        sendToDriverPushNotification(
          order?.driver?._id ? String(order.driver._id) : String(order.driver),
          {
            notification: {
              title: `Your Scheduled Ride is cancelled due to no response`,
              body: "Your ride has been cancelled",
            },
            data: {
              notificationType: "ride_canceled",
              bookingId: order?._id?.toString(),
            },
          }
        );
      }
    }
  }

  let orderList: any = await getRidesFromRedis({
    tripStatus: bookingStatus.finding_driver,
    paymentStatus: true
  });

  matchJobShowFromRedis(orderList);

  for (let order of orderList) {
    if (
      order?.scheduled?.scheduledAt &&
      new Date(new Date(order?.createdAt).getTime() + 50 * 60 * 1000) >
      new Date(order.scheduled?.scheduledAt)
    ) {
      await updateBookingInRedis(order?._id, {
        tripStatus: bookingStatus.canceled,
        canceledBy: "automatic",
        canceledReason: "Wrong schedule booking",
        cancelledAt: new Date(),
      });
      if (order?.paymentIntentId?.includes("pi_")) {
        await cancelledPayment(order?.paymentIntentId || "");
      } else if (order?.paymentIntentId) {
        await squareCancelPayment(order?.paymentIntentId || "");
      }
      // sendSocket(
      //   order?.customer?._id?.toString(),
      //   "singlebookingStatusUpdated",
      //   { bookingId: order?._id }
      // );
      sendToUserSocket(order?.customer?._id?.toString(), {
        event: "singlebookingStatusUpdated",
        data: { bookingId: order?._id }
      })
      sendToCustomerPushNotification(
        order?.customer?._id
          ? String(order?.customer?._id)
          : String(order?.customer),
        {
          notification: {
            title: `Your Ride is cancelled due to wrong schedule booking`,
            body: "Do'not worry. You can book your ride again",
          },
          data: {
            notificationType: "ride_canceled",
            bookingId: order?._id?.toString(),
          },
        }
      );
    }

    if (new Date(order.createdAt) >= new Date(Date.now() - 15 * 60 * 1000)) {
      if (!order?.scheduled?.scheduledAt) {
        findNearDriverFromRedis(order);
      }
    } else {
      if (
        order.scheduled?.isScheduled &&
        new Date(order.scheduled?.scheduledAt) > new Date(Date.now() + 10 * 60 * 1000)
      ) {
      } else if (
        order.scheduled?.isScheduled &&
        new Date(order.scheduled?.scheduledAt) < new Date(Date.now() + 10 * 60 * 1000) &&
        new Date(order.scheduled?.scheduledAt) > new Date(Date.now() + 5 * 60 * 1000)
      ) {
        findNearDriverFromRedis(order);
        matchJobProcessStartFromRedis(order);
      } else if (
        order.scheduled?.isScheduled &&
        new Date(order.scheduled?.scheduledAt) < new Date(Date.now() + 5 * 60 * 1000)
      ) {
        await updateBookingInRedis(order?._id, {
          tripStatus: bookingStatus.canceled,
          canceledBy: "automatic",
          canceledReason: "driver not found",
          cancelledAt: new Date(),
        });
        if (order?.paymentIntentId?.includes("pi_")) {
          await cancelledPayment(order?.paymentIntentId || "");
        } else if (order?.paymentIntentId) {
          await squareCancelPayment(order?.paymentIntentId || "");
        }
        // sendSocket(
        //   order?.customer?._id?.toString(),
        //   "singlebookingStatusUpdated",
        //   { bookingId: order?._id }
        // );
        sendToUserSocket(order?.customer?._id?.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: order?._id }
        })
        sendToCustomerPushNotification(
          order?.customer?._id
            ? String(order?.customer?._id)
            : String(order?.customer),
          {
            notification: {
              title: `Your Scheduled Ride is cancelled due to driver unavailability`,
              body: "Do'not worry. You can book your ride again",
            },
            data: {
              notificationType: "ride_canceled",
              bookingId: order?._id?.toString(),
            },
          }
        );
      } else {
        await updateBookingInRedis(order?._id, {
          tripStatus: bookingStatus.canceled,
          canceledBy: "automatic",
          canceledReason: "driver not found",
          cancelledAt: new Date(),
        });
        if (order?.paymentIntentId?.includes("pi_")) {
          await cancelledPayment(order?.paymentIntentId || "");
        } else if (order?.paymentIntentId) {
          await squareCancelPayment(order?.paymentIntentId || "");
        }
        // sendSocket(
        //   order?.customer?._id?.toString(),
        //   "singlebookingStatusUpdated",
        //   { bookingId: order?._id }
        // );
        sendToUserSocket(order?.customer?._id?.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: order?._id }
        })
        sendToCustomerPushNotification(
          order?.customer?._id
            ? String(order?.customer?._id)
            : String(order?.customer),
          {
            notification: {
              title: `Your Ride is cancelled due to driver unavailability`,
              body: "Do'not worry. You can book your ride again",
            },
            data: {
              notificationType: "ride_canceled",
              bookingId: order?._id?.toString(),
            },
          }
        );
        if (order?.scheduled?.isScheduled) {
          let drivers = await getNearByDrivers(
            [
              {
                location: {
                  latitude: order?.tripAddress[0]?.location?.latitude,
                  longitude: order?.tripAddress[0]?.location?.longitude,
                },
              },
            ],
            30000,
            [true, false]
          );
          for (const singleDriver of drivers) {
            sendToDriverPushNotification(singleDriver._id, {
              data: {
                notificationType: "jobInSchdule",
              },
            });
            // sendSocket(singleDriver?._id?.toString(), "jobInSchdule", {});
            sendToDriverSocket(singleDriver?._id?.toString(), {
              event: "jobInSchdule",
              data: {}
            })
          }
        }
      }
    }
  }
};

export const findNearDriverFromRedis = async (order: any) => {
  try {
    if (
      order?.askDriver?.expTime &&
      new Date(order?.askDriver?.expTime) > new Date(new Date().getTime() + processJobToNextBeforeTimeDelay)
    ) {
      return false;
    }
    let rejectedDriver = order?.rejectedDriver || [];
    if (order?.askDrivers && order.askDrivers.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(order.askDrivers || [])];
    }
    let userDetails = await usersModel.findOne({ _id: order?.customer }).lean();
    if (userDetails?.blockDrivers && userDetails?.blockDrivers?.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(userDetails?.blockDrivers || [])];
    }
    rejectedDriver = [
      ...new Set(rejectedDriver?.map((itm: any) => itm.toString())),
    ];
    let orderDetails = await getBookingFromRedis(order?._id);
    if (orderDetails?.carPoolDetails?.isBookingUnderPool) {
      let isJobAssignedToAlreadyExitingPool = await autoPoolJobAssignmentFromRedis(
        orderDetails
      );
      if (isJobAssignedToAlreadyExitingPool) {
        return false;
      }
    }

    const distanceRanges = [];
    for (let i = 1000; i <= 8000; i += 1000) {
      distanceRanges.push(i);
    }

    for (const starting of distanceRanges) {
      let orderDetails = await getBookingFromRedis(order?._id);
      if (
        (orderDetails?.askDriver?.expTime &&
          new Date(orderDetails?.askDriver?.expTime) >
          new Date(new Date().getTime() + processJobToNextBeforeTimeDelay)) ||
        orderDetails?.tripStatus !== bookingStatus?.finding_driver
      ) {
        break;
      }
      let driverList = [];
      if (
        (new Date(Date.now() - oneByOneJobBeforeMatchTiming) < new Date(order?.createdAt)) &&
        starting <= 4000
      ) {
        driverList = await findFreeDriversInRangeFromRedis(
          order,
          rejectedDriver,
          starting
        );
      }
      if (driverList.length === 0) {
        if (starting === 4000) {
          matchJobProcessStartFromRedis(order, true);
        }
        if (starting % 500 === 0) {
          let driverList = await findBusyDriversInRangeFromRedis(
            order,
            rejectedDriver,
            starting
          );
          // continue;
          if (driverList.length === 0) {
            continue;
          } else {
            let res = await updateBusyDriverInRangeSendBookingRequestFromRedis(
              order,
              driverList,
              starting
            );
            if (res) {
              break;
            } else {
              continue;
            }
          }
        }
      } else {
        let res = await updateFreeDriverInRangeSendBookingRequestFromRedis(
          order,
          driverList,
          starting
        );
        if (res) {
          break;
        } else {
          if (starting % 500 === 0) {
            let driverList = await findBusyDriversInRangeFromRedis(
              order,
              rejectedDriver,
              starting
            );
            // continue;
            if (driverList.length === 0) {
              continue;
            } else {
              let res = await updateBusyDriverInRangeSendBookingRequestFromRedis(
                order,
                driverList,
                starting
              );
              if (res) {
                break;
              } else {
                continue;
              }
            }
          }
        }
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const surgeUpdatedFromRedis = async () => {
  try {
    let driverList = await driversModel.aggregate([
      {
        $match: {
          iAmOnline: true,
          iAmBusy: false,
          "vehicleInfo.isApproved": true,
          socket_id: { $ne: null },
        },
      },
    ]);
    for (const element of driverList) {
      // sendSocket([element?._id?.toString()], "surgeUpdated", {});
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const findBusyDriversInRangeFromRedis = async (
  order: any,
  rejectedDriver: any,
  distanceRadius: any
) => {
  let driverList;
  if (!findDriverFromRedis) {
    driverList = await driversModel.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [
              order.tripAddress[0].location.longitude,
              order.tripAddress[0].location.latitude,
            ],
          },
          distanceField: "distance",
          maxDistance: distanceRadius,
          spherical: true,
        },
      },
      {
        $match: {
          iAmOnline: true,
          isDriverUnderPool: false,
          stopFutureRide: false,
          iAmBusy: true,
          "vehicleInfo.isApproved": true,
          _id: {
            $nin: [...rejectedDriver]?.map(
              (itm: any) => new mongoose.Types.ObjectId(itm)
            ),
          },
          $or: [
            { missedBookingAt: null },
            {
              missedBookingAt: {
                $lt: new Date(new Date().getTime() - oneByOneJobExpiryTime),
              },
            },
          ],
        },
      },
      {
        $sort: {
          distance: 1,
        },
      },
    ]);
  } else {
    driverList = await findBusyDriversFromRedis(
      order,
      distanceRadius,
      rejectedDriver.map((itm: any) => itm.toString()),
      oneByOneJobExpiryTime
    );
  }

  // console.log(driverList, "busydrivers")

  const adminPriorityDriverList: any = await getPriorityDrivers();
  const adminDrivers = driverList?.filter((driver) =>
    adminPriorityDriverList.includes(driver._id.toString())
  );
  const otherDrivers = driverList?.filter(
    (driver) => !adminPriorityDriverList.includes(driver._id.toString())
  );

  return [...adminDrivers, ...otherDrivers];
};

export const updateBusyDriverInRangeSendBookingRequestFromRedis = async (
  order: any,
  driverList: any,
  distanceRadius: any
) => {
  for (const element of driverList) {
    const singleDriver = element;
    if (!singleDriver.iAmOnline) {
      continue;
    }
    const calculateActiveBooking = await calculateActiveBookingInRedis(singleDriver._id);
    const checkedBusyDriverDroppedLoc = await getPickedBookingsForDriverFromRedis(singleDriver._id);
    if (
      calculateActiveBooking >= 2 ||
      !checkedBusyDriverDroppedLoc ||
      !checkedBusyDriverDroppedLoc?.tripAddress ||
      !checkedBusyDriverDroppedLoc?.tripAddress?.length ||
      !order?.tripAddress ||
      !order?.tripAddress?.length
    ) {
      continue;
    }
    let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(
      checkedBusyDriverDroppedLoc?.tripAddress,
      order?.tripAddress
    );
    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(
      singleDriver._id,
      checkedBusyDriverDroppedLoc?.tripAddress,
      true
    );
    const sumOfDistance = DistancekmCheck + Distancekm;

    if (sumOfDistance * 1000 <= distanceRadius) {
      let results = await checkForOtherNearBYJobExitsFromRedis(
        singleDriver,
        order,
        distanceRadius
      );
      if (results) {
        continue;
      }
      let listAskDrivers = (order.askDrivers || [])?.map((itm: any) =>
        itm.toString()
      );

      const expiryTime = new Date(new Date().getTime() + oneByOneJobExpiryTime);
      await updateBookingInRedis(order?._id, {
        askDrivers: [
          ...new Set([...listAskDrivers, singleDriver._id.toString()]),
        ],
        askDriver: {
          driver: singleDriver._id.toString(),
          expTime: expiryTime,
        }
      });
      if (await idExistSaveDriverNotification(singleDriver?._id?.toString())) {
        continue;
      }
      const lockAcquired = await acquireDriverLock(singleDriver._id.toString());
      if (!lockAcquired) {
        break;
      }
      const jobLockAcquired = await acquireJobLock(order?._id?.toString());
      if (!jobLockAcquired) {
        break;
      }
      if (
        singleDriver?.autoAcceptJob &&
        singleDriver?.autoAcceptDistance >= DistancekmCheck
      ) {
        await updateBookingInRedis(order?._id, {
          matchJobDistance: sumOfDistance
        });
        await autoAcceptanceBusyJobFromRedis(order?._id, singleDriver._id);
      } else {
        // sendSocket(singleDriver?._id?.toString(), "newJobRequest", {});
        sendToDriverSocket(singleDriver?._id?.toString(), {
          event: "newJobRequest",
          data: {}
        })
        let { Distancekm, DurationMin } = await getDirectionsDistanceTime(
          singleDriver._id,
          order.tripAddress
        );
        await driversModel.updateOne({ _id: singleDriver?._id }, {
          iAmOnline: true,
          missedBookingCount: 0,
          missedBookingAt: null,
          stopFutureRide: false,
        })
        await saveDriverNotification(singleDriver?._id, {
          _id: order?._id?.toString(),
          tripAddress: order?.tripAddress,
          rideDetails: {
            estimatedTime: order?.expectedBilling?.durationText,
            estimatedDistance: order?.expectedBilling?.kmText,
          },
          askDriver: { expTime: expiryTime },
          driverEarning: order?.expectedBilling?.driverEarning?.fare,
          customer: {
            fullName: order?.customer?.fullName || "",
            avatar: order?.customer?.avatar || "",
            distance: Distancekm,
            time: DurationMin,
          },
        });
        // logger.error({ driver: singleDriver._id, order: order?._id?.toString(), type: 'updateBusyDriverInRangeSendBookingRequestFromRedis' })
        sendToDriverPushNotification(singleDriver._id, {
          notification: {
            title: "New Job Request",
            body: "You have received new job request",
          },
          data: {
            notificationType: "newJobRequest",
            job: JSON.stringify({
              _id: order?._id?.toString(),
              tripAddress: order.tripAddress,
              rideDetails: {
                esitmatedTime: order?.expectedBilling.durationText,
                esitmatedDistance: order?.expectedBilling.kmText,
              },
              askDriver: {
                expTime: expiryTime,
              },
              driverEarning: order?.expectedBilling?.driverEarning?.fare,
              customer: {
                fullName: order?.customer?.fullName || "",
                avatar: order?.customer?.avatar || "",
                distance: Distancekm,
                time: DurationMin,
              },
            }),
          },
        });
      }
      await releaseDriverLock(singleDriver._id.toString());
      return true;
    } else {
      continue;
    }
  }
  return false;
};

export const checkForOtherNearBYJobExitsFromRedis = async (
  singleDriver: any,
  order: any,
  distanceRadius: any
) => {
  let { Distancekm: newDriverDistance, DurationMin: newDriverDuration } =
    await getDirectionsDistanceTime(singleDriver._id, order.tripAddress);
  const eligibleNearBookings = await getEligibleNearBookingsInRedis({
    lat: singleDriver?.location?.coordinates[1],
    lng: singleDriver?.location?.coordinates[0],
  },
    distanceRadius,
    String(singleDriver._id),
    order.orderNo
  );
  if (eligibleNearBookings.length > 0) {
    for (const singleNearByBooking of eligibleNearBookings) {
      let {
        Distancekm: eligibleDriverDistance,
        DurationMin: eligibleDriverDuration,
      } = await getDirectionsDistanceTime(
        singleDriver._id,
        singleNearByBooking.tripAddress
      );
      if (eligibleDriverDistance < newDriverDistance) {
        return true;
      }
    }
  }

  const isAnyBookingRequestAlreadySend = await isBookingRequestAlreadySentToDriver(singleDriver._id, order.orderNo);

  if (isAnyBookingRequestAlreadySend) {
    return true;
  }

  return false;
};

export const autoAcceptanceBusyJobFromRedis = async (orderId: any, driverId: any) => {
  return false;
  if (isProcessing) {
    return false;
  }
  isProcessing = true;
  try {
    let bookingData = await getBookingFromRedis(orderId);

    const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
      driverId,
      bookingData.tripAddress
    );
    let updatedDriverData = {}

    if (!bookingData?.scheduled?.scheduledAt) {
      updatedDriverData = {
        iAmBusy: true,
        missedBookingCount: 0,
        missedBookingAt: null,
        iAmOnline: true,
        isDriverUnderPool: false,
        stopFutureRide: false,
      }

    } else {
      updatedDriverData = {
        missedBookingCount: 0,
        missedBookingAt: null,
        iAmOnline: true,
        isDriverUnderPool: false,
        stopFutureRide: false,
      }
    }
    let driverData: any = await driversModel.findById(driverId).lean();
    const activeBookingCount = await getActiveBookingCountOnThewayArrivedFromRedis(driverId)
    if (activeBookingCount >= 1) {
      return false;
    }
    await driversModel.updateOne({ _id: driverId }, updatedDriverData);

    await updateBookingWithKeyRename(orderId, {
      driver: driverData,
      askDriver: {
        driver: null,
        expTime: null,
      },
      tripStatus: bookingStatus.ontheway,
      acceptedAt: new Date(),
      canceledByDriver: null,
      driverCanceledReason: null,
      pickUpKm: Distancekm,
      pickUpTime: Number(DurationMin.split(" ")[0])
    }, driverId);

    if (bookingData?.customer?._id) {
      sendToCustomerPushNotification(String(bookingData?.customer?._id), {
        notification: {
          title: `Driver accepted your booking`,
          body: "Your booking successfully placed.",
        },
        data: {
          notificationType: "bookingPlaces",
          bookingId: bookingData._id,
        },
      });
    }

    if (bookingData?.scheduled?.isScheduled) {
      let drivers = await getNearByDrivers(
        [
          {
            location: {
              latitude: bookingData.tripAddress[0].location.latitude,
              longitude: bookingData.tripAddress[0].location.longitude,
            },
          },
        ],
        30000,
        [true, false]
      );
      for (const singleDriver of drivers) {
        if (String(driverId) !== String(singleDriver._id)) {
          sendToDriverPushNotification(singleDriver._id, {
            data: {
              notificationType: "jobInSchdule",
            },
          });
          // sendSocket(singleDriver?._id?.toString(), "jobInSchdule", {});
          sendToDriverSocket(singleDriver?._id?.toString(), {
            event: "jobInSchdule",
            data: {}
          })
        }
      }
    }

    sendToDriverPushNotification(driverId, {
      notification: {
        title: "Auto Assigned Job",
        body: "You have been assigned new job",
      },
      data: {},
    });
    const checkedBusyDriverDroppedLoc = await getPickedBookingsForDriverFromRedis(driverId);
    if (checkedBusyDriverDroppedLoc) {
      let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(
        checkedBusyDriverDroppedLoc?.tripAddress,
        bookingData?.tripAddress
      );
      let { Distancekm, DurationMin } = await getDirectionsDistanceTime(
        driverId,
        checkedBusyDriverDroppedLoc?.tripAddress,
        true
      );
      const sumOfDistance = DistancekmCheck + Distancekm;
      await updateBookingInRedis(bookingData._id, {
        matchJobDistance: sumOfDistance
      });
      // sendSocket(
      //   checkedBusyDriverDroppedLoc?.driver?._id?.toString(),
      //   "singlebookingStatusUpdated",
      //   { bookingId: checkedBusyDriverDroppedLoc?._id }
      // );
      sendToDriverSocket(checkedBusyDriverDroppedLoc?.driver?._id?.toString(), {
        event: "singlebookingStatusUpdated",
        data: { bookingId: checkedBusyDriverDroppedLoc?._id }
      })
    }

    let rejectedDriver = bookingData?.rejectedDriver || [];
    if (bookingData?.askDrivers && bookingData?.askDrivers?.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(bookingData?.askDrivers || [])];
    }
    let userDetails = await usersModel.findOne({ _id: bookingData.customer }).lean();
    if (userDetails?.blockDrivers && userDetails?.blockDrivers?.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(userDetails?.blockDrivers || [])];
    }
    rejectedDriver = [
      ...new Set(rejectedDriver?.map((itm: any) => itm?.toString())),
    ];
    let drivers = await getNearByDrivers(
      [
        {
          location: {
            latitude: bookingData.tripAddress[0].location.latitude,
            longitude: bookingData.tripAddress[0].location.longitude,
          },
        },
      ],
      50000,
      [false],
      0,
      rejectedDriver
    );
    for (const singleDriver of drivers) {
      sendToDriverPushNotification(singleDriver._id, {
        data: {
          notificationType: "jobInMatch",
        },
      });
      // sendSocket(singleDriver?._id?.toString(), "jobInMatch", {});
      sendToDriverSocket(singleDriver?._id?.toString(), {
        event: "jobInMatch",
        data: {}
      })
    }
    await deleteMatchNotification("*", bookingData?._id?.toString())

    let driverDetails = await driversModel.findOne({ _id: driverId });
    sendToAllUsers("DriverLocationUpdate", {
      driverId: driverId,
      location: {
        type: "Point",
        coordinates: [
          driverDetails?.location?.coordinates[0] || 0,
          driverDetails?.location?.coordinates[1] || 0,
        ],
      },
      heading: driverDetails?.heading,
    });
    surgeUpdatedFromRedis();
    surgeCompleteProcessForSingleZone(
      bookingData?.tripAddress[0].location.latitude,
      bookingData?.tripAddress[0].location.longitude
    );
    // sendSocket(
    //   bookingData?.customer?._id?.toString(),
    //   "singlebookingStatusUpdated",
    //   { bookingId: orderId }
    // );
    sendToUserSocket(bookingData?.customer?._id?.toString(), {
      event: "singlebookingStatusUpdated",
      data: { bookingId: orderId }
    })
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  } finally {
    isProcessing = false;
  }
};

export const autoPoolJobAssignmentFromRedis = async (order: any) => {
  try {
    let orderListOfPool: any = await getOrderListOfPoolFromRedis();

    if (orderListOfPool?.length === 0) {
      return false;
    }

    let activePoolIds = [
      ...new Set(
        orderListOfPool?.map((itm: any) =>
          itm.carPoolDetails.bookingPoolDetails.poolId.toString()
        )
      ),
    ];

    for (const singleActivePoolId of activePoolIds) {
      let onlyPoolDetails: any = await rideBookingsModel
        .findOne({
          "carPoolDetails.bookingPoolDetails.poolId": singleActivePoolId,
          "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
          "carPoolDetails.bookingPoolDetails.stopPool": false,
          paymentStatus: true,
        })
        .populate("driver")
        .lean();

      if (onlyPoolDetails) {
        if (
          onlyPoolDetails?.carPoolDetails?.bookingPoolDetails
            ?.currentPassengers +
          order?.switchRider?.passenger <=
          onlyPoolDetails?.carPoolDetails?.bookingPoolDetails?.maxCapacity
        ) {
          let samePoolJobs = await getSamePoolJobsFromRedis(singleActivePoolId);

          if (samePoolJobs?.length === 0) {
            return false;
          }

          let driverDetails = await driversModel.findOne({
            _id: onlyPoolDetails?.driver?._id,
          });

          let currentWayPoints = [];
          for (const singleSamePoolJob of samePoolJobs) {
            if (
              singleSamePoolJob.tripStatus === bookingStatus.ontheway ||
              singleSamePoolJob.tripStatus === bookingStatus.arrived
            ) {
              currentWayPoints.push({
                latitude: singleSamePoolJob.tripAddress[0].location.latitude,
                longitude: singleSamePoolJob.tripAddress[0].location.longitude,
              });
              currentWayPoints.push({
                latitude:
                  singleSamePoolJob.tripAddress[
                    singleSamePoolJob.tripAddress.length - 1
                  ].location.latitude,
                longitude:
                  singleSamePoolJob.tripAddress[
                    singleSamePoolJob.tripAddress.length - 1
                  ].location.longitude,
              });
            } else if (singleSamePoolJob.tripStatus === bookingStatus.picked) {
              currentWayPoints.push({
                latitude:
                  singleSamePoolJob.tripAddress[
                    singleSamePoolJob.tripAddress.length - 1
                  ].location.latitude,
                longitude:
                  singleSamePoolJob.tripAddress[
                    singleSamePoolJob.tripAddress.length - 1
                  ].location.longitude,
              });
            }
          }
          let sortedLoc = await getOptimizedRoute(currentWayPoints, {
            latitude: driverDetails?.location?.coordinates[1],
            longitude: driverDetails?.location?.coordinates[0],
          });
          let formattedLoc = sortedLoc.map((element: any) => {
            return { location: element };
          });
          formattedLoc.unshift({
            location: {
              latitude: driverDetails?.location?.coordinates[1],
              longitude: driverDetails?.location?.coordinates[0],
            },
          });
          let polylineResponse = await getDirections(formattedLoc);
          let latlongArray = await getLatLongFromPolyline(
            polylineResponse[0].overview_polyline.points
          );
          let polylineCoords = latlongArray.map(([lat, lon]) => [lon, lat]);
          let polylineGeoJSON = turf.lineString(polylineCoords);
          let long = order?.tripAddress[0]?.location?.longitude;
          let lat = order?.tripAddress[0]?.location?.latitude;
          let pointToCheck = turf.point([Number(long), Number(lat)]);
          let distance = turf.pointToLineDistance(
            pointToCheck,
            polylineGeoJSON,
            { units: "meters" }
          );
          if (distance >= 2000) {
            return false;
          }
          let bookingData = await getBookingFromRedis(order?._id);
          await updateBookingInRedis(order?._id, {
            driver: onlyPoolDetails?.driver,
            askDriver: {
              "expTime": null,
              "driver": null,
            },
            tripStatus: bookingStatus.ontheway,
            acceptedAt: new Date(),
          });
          if (!bookingData?.scheduled?.scheduledAt) {
            await driversModel.updateOne(
              { _id: onlyPoolDetails?.driver?._id },
              {
                iAmBusy: true,
                missedBookingCount: 0,
                missedBookingAt: null,
                iAmOnline: true,
              }
            );
          }

          if (bookingData?.customer?._id) {
            sendToCustomerPushNotification(String(bookingData?.customer?._id), {
              notification: {
                title: `Driver accepted your booking`,
                body: "Your booking successfully placed.",
              },
              data: {
                notificationType: "bookingPlaces",
                bookingId: bookingData._id,
              },
            });
          }

          if (bookingData?.scheduled?.isScheduled) {
            let drivers = await getNearByDrivers(
              [
                {
                  location: {
                    latitude: bookingData.tripAddress[0].location.latitude,
                    longitude: bookingData.tripAddress[0].location.longitude,
                  },
                },
              ],
              30000,
              [true, false]
            );
            for (const singleDriver of drivers) {
              if (
                String(onlyPoolDetails?.driver?._id) !==
                String(singleDriver._id)
              ) {
                sendToDriverPushNotification(singleDriver._id, {
                  data: {
                    notificationType: "jobInSchdule",
                  },
                });
                // sendSocket(singleDriver?._id?.toString(), "jobInSchdule", {});
                sendToDriverSocket(singleDriver?._id?.toString(), {
                  event: "jobInSchdule",
                  data: {}
                })
              }
            }
          }

          sendToDriverPushNotification(String(onlyPoolDetails?.driver?._id), {
            notification: {
              title: "Auto Assigned Pool Job",
              body: "You have been assigned new nearby pool job",
            },
            data: {},
          });

          sendToAllUsers("DriverLocationUpdate", {
            driverId: onlyPoolDetails?.driver?._id,
            location: {
              type: "Point",
              coordinates: [
                driverDetails?.location?.coordinates[0] || 0,
                driverDetails?.location?.coordinates[1] || 0,
              ],
            },
            heading: driverDetails?.heading,
          });
          surgeUpdatedFromRedis();
          surgeCompleteProcessForSingleZone(
            bookingData?.tripAddress[0].location.latitude,
            bookingData?.tripAddress[0].location.longitude
          );
          // sendSocket(
          //   bookingData?.customer?._id?.toString(),
          //   "singlebookingStatusUpdated",
          //   { bookingId: order?._id }
          // );
          sendToUserSocket(bookingData?.customer?._id?.toString(), {
            event: "singlebookingStatusUpdated",
            data: { bookingId: order?._id }
          })
          //pool job changes
          await driversModel.updateOne(
            { _id: onlyPoolDetails?.driver?._id },
            {
              isDriverUnderPool: true,
            }
          );
          await rideBookingsModel.updateOne(
            { _id: order?._id },
            {
              $set: {
                "carPoolDetails.bookingPoolDetails": {
                  poolId: singleActivePoolId,
                },
              },
            }
          );
          await rideBookingsModel.updateOne(
            {
              "carPoolDetails.bookingPoolDetails.poolId": singleActivePoolId,
              "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
              "carPoolDetails.bookingPoolDetails.stopPool": false,
              paymentStatus: true,
            },
            {
              $addToSet: {
                "carPoolDetails.bookingPoolDetails.bookingIds": order?._id,
              },
              $inc: {
                "carPoolDetails.bookingPoolDetails.currentPassengers":
                  order?.switchRider?.passenger,
              },
            }
          );
          // sendSocket(onlyPoolDetails?.driver?._id?.toString(), "poolUpdated", {
          //   poolId: singleActivePoolId,
          // });
          sendToDriverSocket(onlyPoolDetails?.driver?._id?.toString(), {
            event: "poolUpdated",
            data: { poolId: singleActivePoolId, }
          })
          return true;
        }
      }
    }

    return false;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const updateBusyDriverToFreeFromRedis = async () => {
  try {
    let busyDrivers = await driversModel.find({
      iAmBusy: true,
      "vehicleInfo.isApproved": true,
    });

    for (const singleBusyDrivers of busyDrivers) {
      const isAnyOtherActiveBooking = await isAnyOtherActiveBookingInRedis(singleBusyDrivers._id);
      if (!isAnyOtherActiveBooking) {
        await driversModel.updateOne(
          {
            _id: singleBusyDrivers._id,
          },
          {
            iAmBusy: false,
          }
        );
      }
    }

    let freeDrivers = await driversModel.find({
      iAmBusy: false,
      iAmOnline: true,
      "vehicleInfo.isApproved": true,
    });

    for (const singleBusyDrivers of freeDrivers) {
      const isAnyOtherActiveBooking = await isAnyOtherActiveBookingInRedis(singleBusyDrivers._id);
      if (isAnyOtherActiveBooking) {
        await driversModel.updateOne(
          {
            _id: singleBusyDrivers._id,
          },
          {
            iAmBusy: true,
            iAmOnline: true
          }
        );
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const updateDriverLocFromRedis = async () => {
  try {
    const driversList = await getDriversFromRedis({ iAmOnline: true })
    if (driversList?.length === 0) return;

    const bulkOps: any[] = [];
    driversList?.forEach((driver: any, index: number) => {

      try {
        let updatedData = {
          location: driver?.location,
          heading: driver?.heading || 0
        }

        bulkOps.push({
          updateOne: {
            filter: { _id: driver._id },
            update: { $set: updatedData },
          },
        });
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
      }

    });
    if (bulkOps.length > 0) {
      await driversModel.bulkWrite(bulkOps);
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const autoDeletePricingFromRedis = async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    await pricingForUserModel.deleteMany({
      createdAt: { $lt: thirtyMinutesAgo },
    });
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const matchJobShowFromRedis = async (orderList: any) => {
  try {
    for (let order of orderList) {
      if (!order?.scheduled?.scheduledAt) {
        if (
          new Date(Date.now()) >=
          new Date(order?.lastMatchedAt)
        ) {
          matchJobProcessStartFromRedis(order);
        }
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const matchJobProcessStartFromRedis = async (order: any, forceRun = false) => {
  try {
    if (
      order?.matchJobDistance !== 50 &&
      ((new Date(Date.now() - oneByOneJobBeforeMatchTiming) >=
        new Date(order?.createdAt)) ||
        forceRun)
    ) {
      let distanceArray = [
        0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25,
        3.5, 3.75, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50,
      ];
      if (order?.scheduled?.isScheduled) {
        distanceArray = [
          0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25,
          3.5, 3.75, 4, 5, 6
        ];
      }
      for (let i in distanceArray) {
        let currentIndex = Number(i);
        let previousIndex = currentIndex > 0 ? currentIndex - 1 : null;
        let currentElement = distanceArray[currentIndex];
        let previousElement =
          previousIndex !== null ? distanceArray[previousIndex] : 0;
        let resData = await sendMatchJobWithNotifyFromRedis(
          order,
          currentElement,
          previousElement
        );
        if (resData) {
          return true;
        }
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const sendMatchJobWithNotifyFromRedis = async (
  order: any,
  maxDistance: any,
  minDistance: any
) => {
  try {
    let orderDetails = await getBookingFromRedis(order?._id);
    if (!orderDetails) {
      return false;
    }
    if (orderDetails?.matchJobDistance >= maxDistance) {
      return false;
    }

    let rejectedDriver = orderDetails?.rejectedDriver || [];
    let userDetails = await usersModel.findOne({ _id: orderDetails?.customer }).lean();
    if (userDetails?.blockDrivers && userDetails?.blockDrivers?.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(userDetails?.blockDrivers || [])];
    }
    rejectedDriver = [
      ...new Set(rejectedDriver?.map((itm: any) => itm.toString())),
    ];

    let priorityDrivers = orderDetails?.priorityDrivers || [];
    priorityDrivers = [
      ...new Set(priorityDrivers?.map((itm: any) => itm.toString())),
    ];

    let matchJobDrivers = orderDetails?.matchJobDrivers || [];
    matchJobDrivers = [
      ...new Set(matchJobDrivers?.map((itm: any) => itm.toString())),
    ];
    let alreadySendDrivers = await getNearByDrivers(
      [
        {
          location: {
            latitude: order?.tripAddress[0]?.location?.latitude,
            longitude: order?.tripAddress[0]?.location?.longitude,
          },
        },
      ],
      orderDetails?.matchJobDistance * 1000,
      [false],
      0,
      rejectedDriver
    );
    if (
      alreadySendDrivers.length >= 1 &&
      orderDetails?.lastMatchedAt &&
      new Date(Date.now()) <=
      new Date(orderDetails?.lastMatchedAt)
    ) {
      return true;
    }
    // let priorityDriversList = [];
    // if (orderDetails?.priorityMatchedAt && new Date(Date.now()) <= new Date(new Date(orderDetails?.priorityMatchedAt).getTime())) {
    //   return true
    // }

    // if (!orderDetails?.priorityMatchedAt) {
    //   priorityDriversList = await getNearByDrivers( [{ location: { latitude: order.tripAddress[0].location.latitude, longitude: order.tripAddress[0].location.longitude } }], 1.5 * 1000, [false], minDistance * 1000, rejectedDriver, false, priorityDrivers, true);
    // }

    let drivers = [];
    await updateBookingInRedis(order?._id, {
      matchJobDistance: maxDistance
    });

    drivers = await getNearByDrivers(
      [
        {
          location: {
            latitude: order.tripAddress[0].location.latitude,
            longitude: order.tripAddress[0].location.longitude,
          },
        },
      ],
      maxDistance * 1000,
      [false],
      minDistance * 1000,
      rejectedDriver
    );
    if (drivers.length === 0) {
      return false;
    }
    // } else {
    //   drivers = priorityDriversList;

    //   let newDriverIds = priorityDriversList?.map((d: any) => d._id.toString());
    //   let priorityExpiryTime = new Date(new Date().getTime() + 20 * 1000);

    //   await bookingsModel.updateOne(
    //     { _id: order?._id },
    //     {
    //       priorityDrivers: [
    //         ...new Set([
    //           ...priorityDrivers,
    //           ...newDriverIds,
    //         ]),
    //       ],
    //       priorityMatchedAt: priorityExpiryTime
    //     }
    //   )
    // }

    let newDriverIds = drivers?.map((d: any) => d?._id?.toString());
    await updateBookingInRedis(order?._id, {
      matchJobDrivers: [...new Set([...matchJobDrivers, ...newDriverIds])],
    });

    for (const singleDriver of drivers) {
      if (!matchJobDrivers.includes(singleDriver?._id?.toString())) {
        await driversModel.updateOne({ _id: singleDriver?._id }, {
          iAmOnline: true,
          missedBookingCount: 0,
          missedBookingAt: null,
          stopFutureRide: false,
        })
        await saveDriverMatchNotification(singleDriver?._id?.toString(), order?._id?.toString(), order)
        sendToDriverPushNotification(String(singleDriver._id), {
          notification: {
            title: `Matched Job Nearby`,
            body: "You can accept this job.",
          },
          data: {
            notificationType: "jobInMatch",
          },
        });
        // sendSocket(singleDriver?._id?.toString(), "jobInMatch", {});
        sendToUserSocket(singleDriver?._id?.toString(), {
          event: "jobInMatch",
          data: {}
        })
        await driversModel.updateOne(
          { _id: singleDriver._id, socket_id: "" },
          {
            $inc: { missedBookingCount: 1 },
            missedBookingAt: new Date(new Date().getTime()),
          }
        );
      }
    }

    let allSendDrivers = await getNearByDrivers(
      [
        {
          location: {
            latitude: order.tripAddress[0].location.latitude,
            longitude: order.tripAddress[0].location.longitude,
          },
        },
      ],
      maxDistance * 1000,
      [false],
      0,
      rejectedDriver
    );
    if (allSendDrivers.length === 0) {
      return false;
    }

    let expiryTime = new Date(new Date().getTime() + matchJobExpiryTime);
    await updateBookingInRedis(order?._id, {
      lastMatchedAt: expiryTime
    });

    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const findFreeDriversInRangeFromRedis = async (
  order: any,
  rejectedDriver: any,
  distanceRadius: any
) => {
  let driverList;
  if (!findDriverFromRedis) {
    driverList = await driversModel.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [
              order.tripAddress[0].location.longitude,
              order.tripAddress[0].location.latitude,
            ],
          },
          distanceField: "distance",
          maxDistance: distanceRadius,
          spherical: true,
        },
      },
      {
        $match: {
          iAmOnline: true,
          isDriverUnderPool: false,
          stopFutureRide: false,
          iAmBusy: false,
          "vehicleInfo.isApproved": true,
          _id: {
            $nin: [...rejectedDriver]?.map(
              (itm: any) => new mongoose.Types.ObjectId(itm)
            ),
          },
          $or: [
            { missedBookingAt: null },
            {
              missedBookingAt: {
                $lt: new Date(new Date().getTime() - oneByOneJobExpiryTime),
              },
            },
          ],
        },
      },
      {
        $sort: {
          distance: 1,
        },
      },
    ]);
  } else {
    driverList = await getNearbyDriversFromRedis(
      order,
      distanceRadius,
      rejectedDriver.map((itm: any) => new mongoose.Types.ObjectId(itm).toString()),
      oneByOneJobExpiryTime
    );
  }

  const adminPriorityDriverList: any = await getPriorityDrivers();
  const adminDrivers = driverList?.filter((driver) =>
    adminPriorityDriverList.includes(driver._id.toString())
  );
  const otherDrivers = driverList?.filter(
    (driver) => !adminPriorityDriverList.includes(driver._id.toString())
  );

  return [...adminDrivers, ...otherDrivers];
};

export const updateFreeDriverInRangeSendBookingRequestFromRedis = async (
  order: any,
  driverList: any,
  distanceRadius: any
) => {
  for (const element of driverList) {
    const singleDriver = element;
    if (!singleDriver.iAmOnline) {
      continue;
    }

    let results = await checkForOtherNearBYJobExitsFromRedis(
      singleDriver,
      order,
      distanceRadius
    );
    if (results) {
      continue;
    }

    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(
      singleDriver._id,
      order.tripAddress
    );
    let listAskDrivers = (order.askDrivers || [])?.map((itm: any) =>
      itm.toString()
    );

    const expiryTime = new Date(new Date().getTime() + oneByOneJobExpiryTime);
    if (await idExistSaveDriverNotification(singleDriver?._id?.toString())) {
      continue;
    }
    const lockAcquired = await acquireDriverLock(singleDriver._id.toString());
    if (!lockAcquired) {
      break;
    }
    const jobLockAcquired = await acquireJobLock(order?._id?.toString());
    if (!jobLockAcquired) {
      break;
    }
    await updateBookingInRedis(order?._id, {
      askDrivers: [
        ...new Set([...listAskDrivers, singleDriver._id.toString()]),
      ],
      askDriver: {
        driver: singleDriver._id.toString(),
        expTime: expiryTime,
      }
    });
    // sendSocket(singleDriver?._id?.toString(), "newJobRequest", {});
    sendToDriverSocket(singleDriver?._id?.toString(), {
      event: "newJobRequest",
      data: {}
    })
    await driversModel.updateOne({ _id: singleDriver?._id }, {
      iAmOnline: true,
      missedBookingCount: 0,
      missedBookingAt: null,
      stopFutureRide: false,
    })
    await saveDriverNotification(singleDriver?._id, {
      _id: order?._id?.toString(),
      tripAddress: order?.tripAddress,
      rideDetails: {
        estimatedTime: order?.expectedBilling?.durationText,
        estimatedDistance: order?.expectedBilling?.kmText,
      },
      askDriver: { expTime: expiryTime },
      driverEarning: order?.expectedBilling?.driverEarning?.fare,
      customer: {
        fullName: order?.customer?.fullName || "",
        avatar: order?.customer?.avatar || "",
        distance: Distancekm,
        time: DurationMin,
      },
    });
    // logger.error({ driver: singleDriver._id, order: order?._id?.toString(), type: 'updateFreeDriverInRangeSendBookingRequestFromRedis' })
    sendToDriverPushNotification(singleDriver._id, {
      notification: {
        title: "New Job Request",
        body: "You have received new job request",
      },
      data: {
        notificationType: "newJobRequest",
        job: JSON.stringify({
          _id: order?._id?.toString(),
          tripAddress: order.tripAddress,
          rideDetails: {
            esitmatedTime: order?.expectedBilling.durationText,
            esitmatedDistance: order?.expectedBilling.kmText,
          },
          askDriver: {
            expTime: expiryTime,
          },
          driverEarning: order?.expectedBilling?.driverEarning?.fare,
          customer: {
            fullName: order?.customer?.fullName || "",
            avatar: order?.customer?.avatar || "",
            distance: Distancekm,
            time: DurationMin,
          },
        }),
      },
    });
    await driversModel.updateOne(
      { _id: singleDriver._id },
      {
        $inc: { missedBookingCount: 1 },
        missedBookingAt: new Date(new Date().getTime()),
      }
    );
    await releaseDriverLock(singleDriver._id.toString());
    return true;
  }
  return false;
};

export const updateFreeDriverInRangeSendBookingRequestAgainFromRedis = async (
  order: any,
  driverList: any,
  distanceRadius: any
) => {
  for (const element of driverList) {
    const singleDriver = element;
    if (!singleDriver.iAmOnline) {
      return false;
    }

    let results = await checkForOtherNearBYJobExitsFromRedis(
      singleDriver,
      order,
      distanceRadius
    );
    if (results) {
      return false;
    }
    const checkedBusyDriverDroppedLoc = await getPickedBookingsForDriverFromRedis(order.driver);
    if (
      !checkedBusyDriverDroppedLoc ||
      !checkedBusyDriverDroppedLoc?.tripAddress ||
      !checkedBusyDriverDroppedLoc?.tripAddress?.length ||
      !order?.tripAddress ||
      !order?.tripAddress?.length
    ) {
      return false;
    }

    let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(
      checkedBusyDriverDroppedLoc?.tripAddress,
      order?.tripAddress
    );
    let firstJobDropDetails = await getDirectionsDistanceTime(
      order.driver,
      checkedBusyDriverDroppedLoc?.tripAddress,
      true
    );
    const sumOfDistance = DistancekmCheck + firstJobDropDetails.Distancekm;

    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(
      singleDriver._id,
      order.tripAddress
    );
    if (sumOfDistance >= Distancekm) {
      let listAskDrivers = (order.askDrivers || [])?.map((itm: any) =>
        itm.toString()
      );

      const expiryTime = new Date(new Date().getTime() + oneByOneJobExpiryTime);
      if (await idExistSaveDriverNotification(singleDriver?._id?.toString())) {
        continue;
      }
      const lockAcquired = await acquireDriverLock(singleDriver._id.toString());
      if (!lockAcquired) {
        break;
      }
      const jobLockAcquired = await acquireJobLock(order?._id?.toString());
      if (!jobLockAcquired) {
        break;
      }
      await updateBookingInRedis(order?._id, {
        askDrivers: [
          ...new Set([...listAskDrivers, singleDriver._id.toString()]),
        ],
        askDriver: {
          driver: singleDriver._id.toString(),
          expTime: expiryTime,
        },
      });
      // sendSocket(singleDriver?._id?.toString(), "newJobRequest", {});
      sendToDriverSocket(singleDriver?._id?.toString(), {
        event: "newJobRequest",
        data: {}
      })
      await driversModel.updateOne({ _id: singleDriver?._id }, {
        iAmOnline: true,
        missedBookingCount: 0,
        missedBookingAt: null,
        stopFutureRide: false,
      })
      await saveDriverNotification(singleDriver?._id, {
        _id: order?._id?.toString(),
        tripAddress: order?.tripAddress,
        rideDetails: {
          estimatedTime: order?.expectedBilling?.durationText,
          estimatedDistance: order?.expectedBilling?.kmText,
        },
        askDriver: { expTime: expiryTime },
        driverEarning: order?.expectedBilling?.driverEarning?.fare,
        customer: {
          fullName: order?.customer?.fullName || "",
          avatar: order?.customer?.avatar || "",
          distance: Distancekm,
          time: DurationMin,
        },
      });
      // logger.error({ driver: singleDriver._id, order: order?._id?.toString(), type: 'updateFreeDriverInRangeSendBookingRequestAgainFromRedis' })
      sendToDriverPushNotification(singleDriver._id, {
        notification: {
          title: "New Job Request",
          body: "You have received new job request",
        },
        data: {
          notificationType: "newJobRequest",
          job: JSON.stringify({
            _id: order?._id?.toString(),
            tripAddress: order.tripAddress,
            rideDetails: {
              esitmatedTime: order?.expectedBilling.durationText,
              esitmatedDistance: order?.expectedBilling.kmText,
            },
            askDriver: {
              expTime: expiryTime,
            },
            driverEarning: order?.expectedBilling?.driverEarning?.fare,
            customer: {
              fullName: order?.customer?.fullName || "",
              avatar: order?.customer?.avatar || "",
              distance: Distancekm,
              time: DurationMin,
            },
          }),
        },
      });
      await driversModel.updateOne(
        { _id: singleDriver._id },
        {
          $inc: { missedBookingCount: 1 },
          missedBookingAt: new Date(new Date().getTime()),
        }
      );
      await releaseDriverLock(singleDriver._id.toString());
      return true;
    } else {
      continue;
    }
  }
  return false;
};

export const autoReplaceJobFromRedis = async (onTheWayOrder: any, pickUpOrder: any) => {
  try {
    let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(
      pickUpOrder?.tripAddress,
      onTheWayOrder?.tripAddress
    );
    const pickupDropLoc =
      pickUpOrder?.tripAddress[pickUpOrder?.tripAddress.length - 1].location;
    const eligibleNearBookings = await getNearestBookingInRedis(
      { latitude: pickupDropLoc?.latitude, longitude: pickupDropLoc?.longitude },
      DistancekmCheck
    );
    if (eligibleNearBookings.length > 0) {
      for (const singleNearByBooking of eligibleNearBookings) {
        let {
          DistancekmCheck: eligibleDriverDistance,
          DurationMinCheck: eligibleDriverDuration,
        } = await getDistanceTime(
          pickUpOrder?.tripAddress,
          singleNearByBooking?.tripAddress
        );
        if (eligibleDriverDistance < DistancekmCheck) {
          await makeOnTheWayToFindingDriverFromRedis(
            onTheWayOrder._id,
            onTheWayOrder?.driver
          );
          await makeFindingDriverToOnTheWayFromRedis(
            singleNearByBooking._id,
            onTheWayOrder?.driver
          );
        }
      }
    }
  } catch (e) { }
};

export const makeOnTheWayToFindingDriverFromRedis = async (orderId: any, driverId: any) => {
  try {
    let bookingData = await getBookingFromRedis(orderId);
    await renameKeyInRedis(`booking:${orderId}-${String(bookingData?.customer?._id)}-${bookingData?.driver ? bookingData?.driver._id : '*'}`, `booking:${orderId}-${String(bookingData?.customer?._id)}-*`);
    await updateBookingInRedis(orderId, {
      driver: null,
      tripStatus: bookingStatus.finding_driver,
      askDriver: {
        driver: null,
        expTime: null,
      },
      "scheduled.startRide": false,
      "carPoolDetails.bookingPoolDetails": null,
      acceptedAt: null,
      autoReplacedJob: 1,
    });
    if (bookingData?.customer?._id) {
      sendToCustomerPushNotification(String(bookingData?.customer?._id), {
        notification: {
          title: `Finding new driver for you.`,
          body: "Last ride cancelled by driver. Don't worry we will assign new driver shortly.",
        },
        data: {
          notificationType: bookingStatus.finding_driver,
          bookingId: bookingData._id,
        },
      });
    }

    if (!bookingData?.scheduled?.scheduledAt) {
      findNearDriverFromRedis(bookingData);
      matchJobProcessStartFromRedis(bookingData);
      surgeUpdatedFromRedis();
      surgeCompleteProcessForSingleZone(
        bookingData?.tripAddress[0].location.latitude,
        bookingData?.tripAddress[0].location.longitude
      );
    }

    if (bookingData?.scheduled?.isScheduled) {
      let drivers = await getNearByDrivers(
        [
          {
            location: {
              latitude: bookingData.tripAddress[0].location.latitude,
              longitude: bookingData.tripAddress[0].location.longitude,
            },
          },
        ],
        30000,
        [true, false]
      );
      for (const singleDriver of drivers) {
        if (String(bookingData.driver) !== String(singleDriver._id)) {
          sendToDriverPushNotification(singleDriver._id, {
            notification: {
              title: "New Job in schedule tab",
              body: "You can accept this job by from schedule tab ",
            },
            data: {
              notificationType: "jobInSchdule",
            },
          });
        }
      }
    }
    // sendSocket(
    //   bookingData?.customer?._id?.toString(),
    //   "singlebookingStatusUpdated",
    //   { bookingId: orderId }
    // );
    sendToUserSocket(bookingData?.customer?._id?.toString(), {
      event: "singlebookingStatusUpdated",
      data: { bookingId: orderId }
    })
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const makeFindingDriverToOnTheWayFromRedis = async (orderId: any, driverId: any) => {
  try {
    let bookingData = await getBookingFromRedis(orderId);

    let updatedDriverDetails = {}
    if (!bookingData?.scheduled?.scheduledAt) {
      updatedDriverDetails = {
        iAmBusy: true,
        missedBookingCount: 0,
        missedBookingAt: null,
        iAmOnline: true,
        isDriverUnderPool: false,
        stopFutureRide: false,
      }

    } else {
      updatedDriverDetails = {
        missedBookingCount: 0,
        missedBookingAt: null,
        iAmOnline: true,
        isDriverUnderPool: false,
        stopFutureRide: false,
      }

    }
    await driversModel.updateOne({ _id: driverId }, updatedDriverDetails);
    let driverDetail: any = await driversModel.findOne({ _id: driverId }).lean();

    await renameKeyInRedis(`booking:${orderId}-${String(bookingData?.customer?._id)}-${bookingData?.driver ? bookingData?.driver._id : '*'}`, `booking:${orderId}-${String(bookingData?.customer?._id)}-${driverDetail?._id}`);

    await updateBookingInRedis(orderId, {
      driver: driverDetail,
      askDriver: {
        "expTime": null,
        "driver": null,
      },
      tripStatus: bookingStatus.ontheway,
      acceptedAt: new Date(),
    });
    if (bookingData?.customer?._id) {
      sendToCustomerPushNotification(String(bookingData?.customer?._id), {
        notification: {
          title: `Driver accepted your booking`,
          body: "Your booking successfully placed.",
        },
        data: {
          notificationType: "bookingPlaces",
          bookingId: bookingData._id,
        },
      });
    }

    if (bookingData?.scheduled?.isScheduled) {
      let drivers = await getNearByDrivers(
        [
          {
            location: {
              latitude: bookingData.tripAddress[0].location.latitude,
              longitude: bookingData.tripAddress[0].location.longitude,
            },
          },
        ],
        30000,
        [true, false]
      );
      for (const singleDriver of drivers) {
        if (String(driverId) !== String(singleDriver._id)) {
          sendToDriverPushNotification(singleDriver._id, {
            data: {
              notificationType: "jobInSchdule",
            },
          });
          // sendSocket(singleDriver?._id?.toString(), "jobInSchdule", {});
          sendToDriverSocket(singleDriver?._id?.toString(), {
            event: "jobInSchdule",
            data: {}
          })
        }
      }
    }

    sendToDriverPushNotification(driverId, {
      notification: {
        title: "Auto Replaced Job",
        body: "You have been assigned new nearby job",
      },
      data: {},
    });

    const checkedBusyDriverDroppedLoc = await getPickedBookingsForDriverFromRedis(driverId);
    if (checkedBusyDriverDroppedLoc) {
      // sendSocket(
      //   checkedBusyDriverDroppedLoc?.driver?._id?.toString(),
      //   "singlebookingStatusUpdated",
      //   { bookingId: checkedBusyDriverDroppedLoc?._id }
      // );
      sendToDriverSocket(checkedBusyDriverDroppedLoc?.driver?._id?.toString(), {
        event: "singlebookingStatusUpdated",
        data: { bookingId: checkedBusyDriverDroppedLoc?._id }
      })
    }

    let driverDetails = await driversModel.findOne({ _id: driverId });
    sendToAllUsers("DriverLocationUpdate", {
      driverId: driverId,
      location: {
        type: "Point",
        coordinates: [
          driverDetails?.location?.coordinates[0] || 0,
          driverDetails?.location?.coordinates[1] || 0,
        ],
      },
      heading: driverDetails?.heading,
    });
    surgeUpdatedFromRedis();
    surgeCompleteProcessForSingleZone(
      bookingData?.tripAddress[0].location.latitude,
      bookingData?.tripAddress[0].location.longitude
    );
    // sendSocket(
    //   bookingData?.customer?._id?.toString(),
    //   "singlebookingStatusUpdated",
    //   { bookingId: orderId }
    // );
    sendToUserSocket(bookingData?.customer?._id?.toString(), {
      event: "singlebookingStatusUpdated",
      data: { bookingId: orderId }
    })
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const setupOrderForScheduledBookingFromRedis = async (order: any) => {
  if (!order.searchingCompleted) {
    let orderDetails = await getBookingFromRedis(order?._id);
    if (orderDetails.searchingCompleted) {
      return true;
    }

    await updateBookingInRedis(order?._id, {
      "scheduled.isScheduled": true,
      searchingCompleted: true,
      searchingCount: (orderDetails?.searchingCount || 0) + 1
    });

    let driverList = await driversModel.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [
              order.tripAddress[0].location.longitude,
              order.tripAddress[0].location.latitude,
            ],
          },
          distanceField: "distance",
          maxDistance: 50000,
          spherical: true,
        },
      },
      {
        $match: {
          iAmOnline: true,
          "vehicleInfo.isApproved": true,
        },
      },
      {
        $sort: {
          distance: 1,
        },
      },
    ]);

    for (let driver of driverList) {
      sendToDriverPushNotification(driver._id, {
        notification: {
          title: "New Job in schedule tab",
          body: "You can accept this job by from schedule tab ",
        },
        data: {
          notificationType: "jobInSchdule",
        },
      });
    }
  }

  return true;
};

export const doubleJobBusyDriverJobRegularCheckFromRedis = async () => {
  let orderListOnTheWay = await getOrderListOnTheWayFromRedis();

  for (let order of orderListOnTheWay) {
    const checkedBusyDriverDroppedLoc = await getPickedBookingsForDriverFromRedis(order.driver);
    if (checkedBusyDriverDroppedLoc) {
      // let res = await findNearDriverAgain(order);
      // if (!res) {
      await autoReplaceJobFromRedis(order, checkedBusyDriverDroppedLoc);
      // }
    }
  }
};

export const findNearDriverAgainFromRedis = async (order: any) => {
  try {
    if (
      order?.askDriver?.expTime &&
      new Date(order?.askDriver?.expTime) > new Date(new Date().getTime() + processJobToNextBeforeTimeDelay)
    ) {
      return false;
    }
    let rejectedDriver = order?.rejectedDriver || [];
    if (order?.askDrivers && order.askDrivers.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(order.askDrivers || [])];
    }
    let userDetails = await usersModel.findOne({ _id: order?.customer }).lean();
    if (userDetails?.blockDrivers && userDetails?.blockDrivers?.length != 0) {
      rejectedDriver = [...rejectedDriver, ...(userDetails?.blockDrivers || [])];
    }
    rejectedDriver = [
      ...new Set(rejectedDriver?.map((itm: any) => itm.toString())),
    ];

    const distanceRanges = [];
    for (let i = 250; i <= 3000; i += 250) {
      distanceRanges.push(i);
    }
    for (const starting of distanceRanges) {
      let orderDetails = await getBookingFromRedis(order?._id);
      if (
        orderDetails?.askDriver?.expTime &&
        new Date(orderDetails?.askDriver?.expTime) >
        new Date(new Date().getTime() + processJobToNextBeforeTimeDelay)
      ) {
        break;
      }
      let driverList = await findFreeDriversInRangeFromRedis(
        order,
        rejectedDriver,
        starting
      );
      if (driverList.length === 0) {
      } else {
        let res = await updateFreeDriverInRangeSendBookingRequestAgainFromRedis(
          order,
          driverList,
          starting
        );
        if (res) {
          return true;
        } else {
          continue;
        }
      }
    }
    return false;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};
