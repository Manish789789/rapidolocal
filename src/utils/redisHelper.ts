import rideBookingsModel, { bookingStatus } from "@/modules/ride-bookings/models/rideBookings.model";
import driversModel from "@/modules/drivers/models/drivers.model";
import geolib from "geolib";
import { haversineDistanceCalculate } from "./map/helper";
import { logger } from "./logger";
import { jobSendByRedis, oneByOneJobExpiryTime } from "./constant";
import { getRedis } from "@/plugins/redis/redis.plugin";
import { applyMongoLikeUpdate, MongooseFilter, updateRedisJson } from "./mongo.feature";
import driversWithdrawalModel from "@/modules/drivers/models/driversWithdrawal.model";
import { decryptPassword, inquirePayment, makeTransferMoneyByRBC, sleep } from "@/modules/rbcBank/helper";
import driversWalletTransactionModel from "@/modules/drivers/models/driversWalletTransaction.model";
import usersModel from "@/modules/users/models/users.model";

export const getDriversFromRedis = async (filters?: Record<string, any>) => {
  let redis = await getRedis();
  if (!redis) return [];
  let cursor = "0";
  const drivers: any[] = [];

  do {
    const result = await redis.scan(cursor, { MATCH: 'driver:*', COUNT: 100 });

    cursor = result.cursor;
    const keys = result.keys;

    if (keys?.length > 0) {

      const values = await redis?.json?.mGet(keys, '$');
      const parsedDrivers = values.map((v: any) => (Array.isArray(v) && v.length > 0 ? v[0] : null)).filter(Boolean);
      if (filters && Object.keys(filters).length > 0) {
        const filteredDrivers = MongooseFilter.filter(parsedDrivers, filters);
        drivers.push(...filteredDrivers);
      } else {
        drivers.push(...parsedDrivers);
      }

    }
  } while (cursor !== '0');

  return drivers;
}

export const getDriverFromRedis = async (driverId: string) => {
  let redis = await getRedis();
  if (!redis) return {};

  const result: any = await redis.json.get(`driver:${String(driverId)}`, { path: '$' });
  return result?.length > 0 ? result : {}
};
/**
 * Enhanced getRidesFromRedis function using the improved MongooseFilter
 */
export const getRidesFromRedisByUser = async (userId: string, filters?: Record<string, any>) => {
  let redis = await getRedis();
  if (!redis) return [];

  let cursor = "0";
  const rides: any[] = [];

  do {

    const result = await redis.scan(cursor, { MATCH: `booking:*-${userId}-*`, COUNT: 100 });
    cursor = result.cursor;
    const keys = result.keys;

    if (keys?.length > 0) {
      let values = await redis?.json?.mGet(keys, '$');
      values = values.map((v: any) => (Array.isArray(v) && v.length > 0 ? v[0] : null)).filter(Boolean);
      values = values?.map((v: any) => {
        if (v?.scheduled?.scheduledAt) {
          v.scheduled.scheduledAt = new Date(v?.scheduled?.scheduledAt);
        }
        return v;
      });
      if (filters && Object.keys(filters).length > 0) {
        const filteredRides = MongooseFilter.filter(values, filters);
        rides.push(...filteredRides);
      } else {
        rides.push(...values);
      }
    }
  } while (cursor !== '0');

  return rides;
}
export const getRidesFromRedisByDriver = async (driverId: string, filters?: Record<string, any>) => {
  let redis = await getRedis();
  if (!redis) return [];

  let cursor = "0";
  const rides: any[] = [];

  do {

    const result = await redis.scan(cursor, { MATCH: `booking:*-*-${driverId}`, COUNT: 100 });
    cursor = result.cursor;
    const keys = result.keys;

    if (keys?.length > 0) {
      let values = await redis?.json?.mGet(keys, '$');
      values = values.map((v: any) => (Array.isArray(v) && v.length > 0 ? v[0] : null)).filter(Boolean);
      if (filters && Object.keys(filters).length > 0) {
        const filteredRides = MongooseFilter.filter(values, filters);
        rides.push(...filteredRides);
      } else {
        rides.push(...values);
      }
    }
  } while (cursor !== '0');

  return rides;
}

export const getRidesFromRedis = async (filters?: Record<string, any>) => {
  let redis = await getRedis();
  if (!redis) return [];

  let cursor = "0";
  const rides: any[] = [];

  do {
    const result = await redis.scan(cursor, { MATCH: 'booking:*', COUNT: 100 });
    cursor = result.cursor;
    const keys = result.keys;

    if (keys?.length > 0) {
      const values = await redis?.json?.mGet(keys, '$');
      const parsedRides = values.map((v: any) => (Array.isArray(v) && v.length > 0 ? v[0] : null)).filter(Boolean);
      if (filters && Object.keys(filters).length > 0) {
        const filteredRides = MongooseFilter.filter(parsedRides, filters);
        rides.push(...filteredRides);
      } else {
        rides.push(...parsedRides);
      }
    }
  } while (cursor !== '0');

  return rides;
}

export const driverDetailsSave = async (driverId: any, newData: any) => {
  try {
    let redis = await getRedis();
    if (redis) {
      if (typeof newData?.iAmOnline != 'undefined' && newData?.iAmOnline === false) {
        await deleteDriverInRedis(driverId);
      } else {
        await updateRedisJson(`driver:${driverId}`, newData);
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const deleteDriverInRedis = async (driverId: string) => {
  try {
    let redis = await getRedis();
    if (redis) {
      await redis?.json?.del(`driver:${String(driverId)}`);
      await redis.zRem(`drivers:geo`, String(driverId));
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
}

export const saveBookingInRedis = async (bookingId: any) => {
  try {
    if (jobSendByRedis) {
      const redis: any = await getRedis();
      let item: any = await rideBookingsModel
        .findById(bookingId)
        .populate("driver customer vehicleType")
        .lean();
      if (redis) {
        await redis?.json.set(`booking:${bookingId}-${item?.customer?._id}-*`, '$', item);
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

/**
 * Deletes a booking from redis.
 * @param {string} bookingId The id of the booking to delete.
 * @returns {Promise<void>}
 */

export const deleteBookingInRedis = async (bookingId: string) => {
  try {
    if (!bookingId) {
      logger.error({ error: "error", msg: "Booking ID is required" });
      return;
    }
    if (jobSendByRedis) {
      let redis = await getRedis();
      let item = await getBookingFromRedis(bookingId);
      if (
        item?.tripStatus === bookingStatus.canceled ||
        item?.tripStatus === bookingStatus.completed ||
        item?.paymentStatus === false
      ) {
        let createKeys = [`booking:${bookingId}-${item?.customer?._id}-*`, `booking:${bookingId}-${item?.customer?._id}-${item?.driver?._id}`];
        let newItem = {
          ...item,
          forceUpdateInDB: true,
        };
        if (item?.driver?._id) {
          newItem.driver = item.driver?._id;
        } else {
          delete newItem.driver;
        }
        if (item?.customer?._id) {
          newItem.customer = item.customer?._id;
        } else {
          delete newItem.customer;
        }
        if (item?.vehicleType?._id) {
          newItem.vehicleType = item.vehicleType?._id;
        } else {
          delete newItem.vehicleType;
        }

        await rideBookingsModel.updateOne({ _id: bookingId }, newItem);
        if (item?.tripStatus === bookingStatus.completed) {
          usersModel.updateOne({ _id: item?.customer?._id ? item?.customer?._id : item?.customer }, { $inc: { rideCount: 1 } }).exec()
          driversModel.updateOne({ _id: item?.driver?._id ? item?.driver?._id : item?.driver }, { $inc: { rideCount: 1 } }).exec()
        }
        if (redis) {
          for (const key of createKeys) {
            await redis?.json?.del(key);
          }
          await redis?.json?.del(`user:${item?.customer?._id ? item?.customer?._id : item?.customer}`);
        }
        clearBookingCache(bookingId);
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

type ArrayFilters = Array<Record<string, any>>;
export const updateBookingInRedis = async (
  bookingId: string,
  updates: Record<string, any>,
  skipDelete: boolean = false
) => {
  try {
    if (jobSendByRedis) {
      const existingBooking = await getBookingFromRedis(bookingId);
      if (!existingBooking) {
        logger.error({ error: "Booking not found", msg: `Booking ${bookingId} not found in Redis` });
        return;
      }

      const customerId = existingBooking.customer?._id || existingBooking.customer;
      const driverId = existingBooking.driver?._id || existingBooking.driver || '*';
      const exactKey = `booking:${bookingId}-${customerId}-${driverId}`;

      await updateRedisJsonDirect(exactKey, updates);

      if (!skipDelete) {
        await deleteBookingInRedis(bookingId);
      }
    }
  }
  catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

// Helper function to safely flatten nested objects for Redis JSON
const flattenForRedis = (obj: Record<string, any>, prefix = ''): Record<string, any> => {
  const flattened: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // For nested objects, flatten them
      Object.assign(flattened, flattenForRedis(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
};

export const updateBookingWithKeyRename = async (
  bookingId: string,
  updates: Record<string, any>,
  newDriverId?: string
) => {
  try {
    if (jobSendByRedis) {
      const redis = await getRedis();
      if (!redis) return;

      // STEP 1: Get existing booking data (leverages optimized caching)
      const existingBooking = await getBookingFromRedis(bookingId);
      if (!existingBooking) {
        logger.error({ error: "Booking not found", msg: `Booking ${bookingId} not found in Redis` });
        return;
      }

      // STEP 2: Construct current Redis key structure
      const customerId = existingBooking.customer?._id || existingBooking.customer;
      const oldDriverId = existingBooking.driver?._id || existingBooking.driver || '*';
      const oldKey = `booking:${bookingId}-${customerId}-${oldDriverId}`;
      if (newDriverId) {
        // ULTRA-FAST: Atomic key rename with pipeline (2 operations → 1 Redis roundtrip)
        const newKey = `booking:${bookingId}-${customerId}-${newDriverId}`;
        const updatedBooking = { ...existingBooking, ...updates };

        // PIPELINE: All operations in one Redis roundtrip
        const pipeline = redis.multi();
        pipeline?.json?.set(newKey, '$', updatedBooking);
        pipeline?.json?.del(oldKey);
        await pipeline.exec();

        // CACHE MANAGEMENT: Invalidate cache to force fresh lookup with new key
        clearBookingCache(bookingId);
      } else {
        // ULTRA-FAST: Batch all field updates using pipeline instead of individual calls
        const pipeline = redis.multi();

        // Flatten nested objects for Redis JSON (avoid "root" errors)
        const flatUpdates = flattenForRedis(updates);

        // Add all updates to pipeline (no individual Redis calls!)
        for (const [path, value] of Object.entries(flatUpdates)) {
          const jsonPath = path === '' ? '$' : `$.${path}`;
          pipeline.json.set(oldKey, jsonPath, value);
        }

        await pipeline.exec();
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const getBookingListOnTheWayFromRedis = async () => {
  try {
    const filtered = await getRidesFromRedis({
      tripStatus: bookingStatus.ontheway,
      paymentStatus: true,
      "scheduled.scheduledAt": { $ne: null },
      "scheduled.isScheduled": true,
    })

    return filtered;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const getBookingListFindingDriverFromRedis = async () => {
  try {
    const bookings = await getRidesFromRedis({
      tripStatus: bookingStatus.finding_driver,
      paymentStatus: true
    });
    return bookings;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const getOrderListOnTheWayFromRedis = async () => {
  try {
    const bookings = await getRidesFromRedis({
      tripStatus: bookingStatus.ontheway,
      paymentStatus: true,
      "scheduled.scheduledAt": null,
      "carPoolDetails.isBookingUnderPool": false,
      "autoReplacedJob": 0
    });

    return bookings;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const getOrderListOfPoolFromRedis = async () => {
  try {
    const filtered = await getRidesFromRedis({
      tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
      paymentStatus: true,
      "carPoolDetails.isBookingUnderPool": true
    });

    return filtered;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const getSamePoolJobsFromRedis = async (singleActivePoolId: any) => {
  try {
    const filtered = await getRidesFromRedis({
      tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
      paymentStatus: true,
      "carPoolDetails.isBookingUnderPool": true,
      "carPoolDetails.bookingPoolDetails.poolId": singleActivePoolId
    });

    return filtered;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const isBookingRequestAlreadySentToDriver = async (singleDriverId: any, orderNo: any) => {
  try {
    const filtered = await getRidesFromRedis({
      tripStatus: bookingStatus.finding_driver,
      paymentStatus: true,
      "askDriver.driver": singleDriverId,
      orderNo: { $ne: orderNo },
    });

    const now = new Date();
    const bookingRawList = filtered
      .map(ride => {
        if (ride?.askDriver?.expTime) {
          return {
            ...ride,
            isExpired: new Date(ride.askDriver.expTime) < now
          };
        }
        return { ...ride, isExpired: true };
      })
      .filter(ride => !ride.isExpired);

    return bookingRawList?.length ? bookingRawList[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const isAnyOtherActiveBookingInRedis = async (driverId: string) => {
  try {
    const match = await getRidesFromRedisByDriver(driverId, {
      tripStatus: { $in: [bookingStatus.picked, bookingStatus.ontheway, bookingStatus.arrived] },
      paymentStatus: true,
      $or: [
        { "scheduled.scheduledAt": null },
        { "scheduled.startRide": true }
      ]
    });
    return match?.length ? match?.[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const calculateActiveBookingInRedis = async (driverId: string): Promise<number> => {
  try {
    const activeBookings = await getRidesFromRedisByDriver(driverId, {
      tripStatus: { $in: [bookingStatus.picked, bookingStatus.ontheway, bookingStatus.arrived] },
      paymentStatus: true,
      $or: [
        { "scheduled.scheduledAt": null },
        {
          "scheduled.scheduledAt": { $ne: null },
          "scheduled.startRide": true
        }
      ]
    });

    return activeBookings.length;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return 0;
  }
};

export const getEligibleNearBookingsInRedis = async (
  driverLocation: { lat: number; lng: number },
  distanceRadius: number,
  driverId: string,
  currentOrderNo: string
): Promise<any[]> => {
  try {
    const rawBookings = await getRidesFromRedis({
      tripStatus: bookingStatus.finding_driver,
      paymentStatus: true,
      orderNo: { $ne: currentOrderNo },
      askDrivers: { $ne: driverId },
    });
    const eligibleBookings = rawBookings.filter((b: any) => {
      if (!b.location?.coordinates) return false;
      const [lng, lat] = b.location.coordinates;
      const distance = geolib.getDistance(
        { latitude: driverLocation.lat, longitude: driverLocation.lng },
        { latitude: lat, longitude: lng }
      );
      return distance <= distanceRadius;
    });
    return eligibleBookings;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const getNearestBookingInRedis = async (
  pickupDropLoc: { latitude: number; longitude: number },
  DistancekmCheck: number
): Promise<any | null> => {
  try {
    const rawBookings = await getRidesFromRedis({
      tripStatus: bookingStatus.finding_driver,
      paymentStatus: true
    });
    const validBookings = rawBookings.map((b: any) => {
      const distance = geolib.getDistance(
        { latitude: pickupDropLoc?.latitude, longitude: pickupDropLoc?.longitude },
        { latitude: b?.location?.coordinates[1], longitude: b?.location?.coordinates[0] }
      );
      return { ...b, distance };
    }).filter((b: any) => b.distance <= DistancekmCheck * 1000).sort((a: any, b: any) => a.distance - b.distance);

    return validBookings.length > 0 ? validBookings[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};


const bookingKeyCache = new Map<string, string>();

export const getBookingFromRedis = async (bookingId: string) => {
  try {
    // STEP 1: Check if we have the exact key cached (O(1) lookup)
    const cachedKey = bookingKeyCache.get(bookingId);
    if (cachedKey) {
      const redis = await getRedis();
      if (redis) {
        try {
          // Direct access using cached exact key - VERY FAST (~5ms)
          const result: any = await redis.json.get(cachedKey, { path: '$' });
          if (result && result.length > 0) {
            return result[0];
          } else {
            // Key doesn't exist anymore, remove from cache to trigger fresh lookup
            bookingKeyCache.delete(bookingId);
          }
        } catch (error) {
          // Key doesn't exist, remove from cache to trigger fresh lookup
          bookingKeyCache.delete(bookingId);
        }
      }
    }

    // STEP 2: Fallback to pattern search if not cached or cache miss (O(n) lookup)
    // This is the expensive operation we want to minimize
    const bookingRaw = await getJsonValuesByPattern(`booking:${bookingId}-*`);

    // STEP 3: Cache the exact key for future use if found
    // This ensures subsequent calls will be O(1) instead of O(n)
    if (bookingRaw && bookingRaw._id) {
      const customerId = bookingRaw.customer?._id || bookingRaw.customer;
      const driverId = bookingRaw.driver?._id || bookingRaw.driver || '*';
      const exactKey = `booking:${bookingId}-${customerId}-${driverId}`;
      bookingKeyCache.set(bookingId, exactKey);
    }

    return bookingRaw || null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const clearBookingCache = (bookingId: string) => {
  bookingKeyCache.delete(bookingId);
};

export const getUserLocFromRedis = async (userId: string) => {
  try {
    const redis: any = await getRedis();
    const userRaw = await redis?.get(`user:${userId}`);
    if (userRaw) {
      return JSON.parse(userRaw);
    }
    return null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const getPickedBookingsForDriverFromRedis = async (driverId: string) => {
  try {
    const booking = await getRidesFromRedisByDriver(driverId, {
      tripStatus: bookingStatus.picked,
      paymentStatus: true
    });
    return booking?.length ? booking[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const isBokingReqSendForDriverFromRedis = async (driverId: string) => {
  try {
    const rides = await getRidesFromRedis({
      tripStatus: { $in: [bookingStatus.finding_driver, bookingStatus.ontheway] },
      paymentStatus: true,
      "askDriver.driver": driverId,
      // "askDriver.expTime": { $gte: new Date(new Date().getTime()) },
      rejectedDriver: { $ne: driverId },
      missedJobRequestDrivers: { $ne: driverId }
    });
    const now = new Date();
    const bookingRawList = rides
      .map(ride => {
        if (ride?.askDriver?.expTime) {
          return {
            ...ride,
            isExpired: new Date(ride.askDriver.expTime) < now
          };
        }
        return { ...ride, isExpired: true };
      })
      .filter(ride => !ride.isExpired);

    return bookingRawList.length > 0 ? bookingRawList[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
}

export const getNearbyBookingFromRedis = async (user: any) => {
  try {
    const driverId = user?._id?.toString();
    const rides = await getRidesFromRedis({
      tripStatus: { $in: [bookingStatus.finding_driver, bookingStatus.ontheway] },
      paymentStatus: true,
      "askDriver.driver": driverId,
      rejectedDriver: { $ne: driverId },
      missedJobRequestDrivers: { $ne: driverId }
    });
    const now = new Date();

    const bookingRawList = rides
      .map(ride => {
        if (ride?.askDriver?.expTime) {
          return {
            ...ride,
            isExpired: new Date(ride.askDriver.expTime) < now
          };
        }
        return { ...ride, isExpired: true };
      })
      .filter(ride => !ride.isExpired);

    const userLocation = {
      latitude: user?.location?.coordinates[1],
      longitude: user?.location?.coordinates[0],
    };
    const filteredBookings = bookingRawList.map((booking) => {
      const pickupLoc = booking?.firstTripAddressGeoLocation?.coordinates;
      if (!pickupLoc) return null;
      const distance = geolib.getDistance(
        { latitude: pickupLoc[1], longitude: pickupLoc[0] },
        userLocation
      );
      return { ...booking, distance };
    }).filter(Boolean).sort((a, b) => a.distance - b.distance);
    return filteredBookings.slice(0, 1);
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const findMatchingBookingsFromRedis = async (request: any) => {
  try {
    const userId = request?.user?._id?.toString();
    const bookingRawList = await getRidesFromRedis({
      tripStatus: { $in: [bookingStatus.finding_driver, bookingStatus.ontheway] },
      paymentStatus: true
    });
    if (!bookingRawList?.length) return [];
    const userLocation = request?.user?.location?.coordinates;
    const now = new Date();
    const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);
    const results = [];
    for (const booking of bookingRawList) {
      if (booking.rejectedDriver?.includes?.(userId)) continue;
      const scheduledAt = booking?.scheduled?.scheduledAt
        ? new Date(booking?.scheduled.scheduledAt)
        : null;
      const isScheduledValid =
        scheduledAt === null || scheduledAt < tenMinutesLater;
      if (!isScheduledValid) continue;

      const askDriverExpired =
        !booking.askDriver ||
        booking.askDriver.driver !== userId ||
        new Date(booking.askDriver.expTime) < now;
      if (!askDriverExpired) continue;
      const pickupCoords = booking?.firstTripAddressGeoLocation?.coordinates;
      if (!pickupCoords) continue;
      const distance = haversineDistanceCalculate(
        userLocation[1],
        userLocation[0],
        pickupCoords[1],
        pickupCoords[0]
      );
      booking.distance = distance;
      const withinDistance = distance < (booking.matchJobDistance || 0) * 1000;
      const isPriorityDriver = booking.priorityDrivers?.includes?.(userId);
      if (withinDistance || isPriorityDriver) {
        results.push(booking);
      }
    }
    results.sort((a, b) => b.distance - a.distance);
    return results.slice(0, 10);
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const getActiveBookingCountFromRedis = async (driverId: string) => {
  try {
    const activeBookings = await getRidesFromRedisByDriver(driverId, {
      tripStatus: { $in: [bookingStatus.picked, bookingStatus.ontheway, bookingStatus.arrived] },
      paymentStatus: true,
      $or: [
        { "scheduled.scheduledAt": null },
        {
          "scheduled.scheduledAt": { $ne: null },
          "scheduled.startRide": true
        }
      ]
    });

    return activeBookings.length;
  } catch (e: any) {
    // console.log("eeee getActiveBookingCountFromRedis", e)
    logger.error({ error: e, msg: e.message });
    return 0;
  }
};

export const getActiveBookingCountOnThewayArrivedFromRedis = async (driverId: string) => {
  try {
    const activeBookings = await getRidesFromRedisByDriver(driverId, {
      tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.arrived] },
      paymentStatus: true,
      $or: [
        { "scheduled.scheduledAt": null },
        {
          "scheduled.scheduledAt": { $ne: null },
          "scheduled.startRide": true
        }
      ]
    });
    return activeBookings.length;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return 0;
  }
};

export const getSecondActiveBookingFromRedis = async (
  driverId: string,
  excludeBookingId: string
) => {
  try {
    const bookings = await getRidesFromRedisByDriver(driverId, {
      tripStatus: { $in: [bookingStatus.picked, bookingStatus.arrived, bookingStatus.ontheway] },
      paymentStatus: true,
      _id: { $ne: excludeBookingId },
      $or: [
        { "scheduled.scheduledAt": null },
        {
          "scheduled.scheduledAt": { $ne: null },
          "scheduled.startRide": true
        }
      ]
    });
    return bookings.length > 0 ? bookings[0] : null;
  } catch (e: any) {
    // console.log("eeee getSecondActiveBookingFromRedis", e)
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const getActiveBookingFromRedis = async (driverId: string) => {
  try {
    const bookings = await getRidesFromRedisByDriver(driverId, {
      tripStatus: { $nin: [bookingStatus.canceled, bookingStatus.completed] },
      paymentStatus: true,
      $or: [
        { "scheduled.scheduledAt": null },
        {
          "scheduled.scheduledAt": { $ne: null },
          "scheduled.startRide": true
        }
      ]
    });

    bookings.sort((a: any, b: any) => {
      const aTime = a.acceptedAt ? new Date(a.acceptedAt).getTime() : Infinity;
      const bTime = b.acceptedAt ? new Date(b.acceptedAt).getTime() : Infinity;
      return aTime - bTime;
    });

    return bookings.length > 0 ? bookings[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const getUserActiveBookingRedis = async (userId: string) => {
  try {
    let bookings = await getRidesFromRedisByUser(userId, {
      tripStatus: { $nin: [bookingStatus.canceled, bookingStatus.completed] },
      paymentStatus: true,
      $or: [
        { "scheduled.scheduledAt": null },
        {
          $and: [
            { "scheduled.scheduledAt": { $ne: null } },
            { "scheduled.startRide": true }
          ],
        },
        {
          $and: [
            { "scheduled.scheduledAt": { $ne: null } },
            { "scheduled.scheduledAt": { $lte: new Date(Date.now() + 10 * 60 * 1000) } }
          ],
        }
      ],
    });
    return bookings.length > 0 ? bookings[0] : {};
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return {};
  }
};

export const getNearbyDriversRedis = async (
  location: {
    latitude: number;
    longitude: number;
  },
  radiusKm: number = 30000
) => {
  const redis: any = await getRedis();
  let driverKeys: string[] = [];
  try {
    const members: string[] = await redis?.sendCommand([
      "GEOSEARCH",
      "drivers:geo",
      "FROMLONLAT",
      location?.longitude?.toString(),
      location?.latitude?.toString(),
      "BYRADIUS",
      radiusKm?.toString(),
      "km",
      "ASC",
      "COUNT",
      "100",
    ]);
    if (members && members.length) {
      driverKeys = members.map((m) => `driver:${m}`);
    }
    if (typeof (redis as any).georadius === "function") {
      const members = await (redis as any).georadius(
        "drivers:geo",
        location?.longitude?.toString(),
        location?.latitude?.toString(),
        radiusKm,
        "km",
        "ASC",
        "COUNT",
        100
      );
      if (members && members.length)
        driverKeys = members.map((m: any) => `driver:${m}`);
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
  try {
    if (driverKeys.length == 0) {
      return [];
    }
    const values = driverKeys.length
      ? (await redis?.json?.mGet(driverKeys, '$')).map((v: any) => v?.[0] ?? null)
      : [];

    const drivers = values
      .map((value: string | null) => {
        if (value) {
          try {
            let data: any = value;
            if (
              data?._id &&
              data?.vehicleInfo?.isApproved === true &&
              data?.iAmOnline === true
            ) {
              return {
                driverId: data?._id,
                heading: data.heading,
                lat: data?.location?.coordinates[1],
                long: data?.location?.coordinates[0],
              };
            }
          } catch (e) {
            return null;
          }
        }
        return null;
      }).filter((driver: any) => driver !== null);
    return drivers;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const redisMigrateWithDb = async () => {
  try {
    const redis: any = await getRedis();
    const keys = await redis?.keys("booking:*-*-*");
    const bookings = keys?.length
      ? (await redis?.json?.mGet(keys, '$')).map((v: any) => v?.[0] ?? null)
      : [];
    for (const booking of bookings) {
      await deleteBookingInRedis(booking?._id)
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
}

export const renameKeyInRedis = async (oldKey: string, newKey: string) => {
  try {
    const redis: any = await getRedis();
    const exists = await redis.exists(oldKey);
    if (exists) {
      await redis.rename(oldKey, newKey);
      return true;
    }
    return false;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
}

async function getJsonValuesByPattern(pattern: string, path: string = '$') {
  const redis: any = await getRedis();
  if (!redis) return [];
  let cursor = "0";
  const matchedKeys: any[] = [];
  do {
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = result.cursor;
    const keys = result.keys;

    if (keys?.length > 0) {
      const values = await redis?.json?.mGet(keys, '$');
      const parsedData = values.map((v: any) => (Array.isArray(v) && v.length > 0 ? v[0] : null)).filter(Boolean);
      matchedKeys.push(...parsedData);
    }
  } while (cursor !== '0');
  return matchedKeys?.[0] || null;
}

export const migrateWalletOfDriver = async () => {
  try {
    let verifiedDrivers: any = await driversModel
      .find({
        "vehicleInfo.isApproved": true,
        wallet: { $gte: 1 },
        bankDetails: { $exists: true },
      })
      .lean();
    let transferMoneyObj: any = {
      "68630fb24362c71f72713730": 5,
    };
    for (const singleDriverPaymentDetails of verifiedDrivers) {
      await driversModel.findByIdAndUpdate(singleDriverPaymentDetails._id, {
        wallet: transferMoneyObj[singleDriverPaymentDetails._id],
      });
    }
  } catch (error) {
    // console.log("Error occurred during cancellation migration:", error);
  }
};

// export const customePayoutByRBC = async () => {
//   try {
//     let verifiedDrivers: any = await driversModel
//       .find({
//         "vehicleInfo.isApproved": true,
//         wallet: { $gte: 1 },
//         bankDetails: { $exists: true },
//         _id: {
//           $in: [
//             "67f08b1a195a23b16dec86e5",
//           ],
//         },
//       }).lean();

//     for (let singleDriverPaymentDetails of verifiedDrivers) {
//       let transferMoneyObj: any = {
//         "67f08b1a195a23b16dec86e5": 5,
//       };

//       if (
//         singleDriverPaymentDetails?.bankDetails?.institutionNumber &&
//         singleDriverPaymentDetails?._id
//       ) {
//         let res = await makeTransferMoneyByRBC(
//           singleDriverPaymentDetails,
//           transferMoneyObj[singleDriverPaymentDetails?._id]
//         );
//         if (
//           res &&
//           (res?.status === "PROCESSED" || res?.status === "PROCESSING")
//         ) {
//           await driversWithdrawalModel.create({
//             driver: singleDriverPaymentDetails._id,
//             amount: transferMoneyObj[singleDriverPaymentDetails._id],
//             txnTime: new Date(),
//             txnId: res?.payment_id || "",
//             confirmation_number: res?.confirmation_number || "",
//             status: res.status === "PROCESSING" ? 1 : 2,
//           });
//         }

//         if (res && res?.status === "PROCESSED") {
//           await driversModel
//             .findByIdAndUpdate(singleDriverPaymentDetails._id, {
//               $inc: {
//                 wallet: -transferMoneyObj[singleDriverPaymentDetails._id],
//                 lifeTimeEarning:
//                   transferMoneyObj[singleDriverPaymentDetails._id],
//               },
//             })
//             .lean();
//           let processingTransactions = await driversWithdrawalModel
//             .find({ status: 1 })
//             .lean();
//           for (const singleDriverProcessingTransactions of processingTransactions) {
//             let singlePaymentStatus = await inquirePayment(
//               singleDriverProcessingTransactions.txnId
//             );

//             switch (singlePaymentStatus.status) {
//               case "PROCESSING":
//                 break;

//               case "PROCESSED":
//                 await driversWithdrawalModel.findByIdAndUpdate(
//                   singleDriverProcessingTransactions._id,
//                   {
//                     status: 2,
//                   }
//                 );
//                 await driversModel.findByIdAndUpdate(
//                   singleDriverProcessingTransactions.driver,
//                   {
//                     $inc: {
//                       wallet: -Math.round(
//                         parseInt(
//                           Number(
//                             singleDriverProcessingTransactions.amount
//                           ).toFixed(2)
//                         )
//                       ),
//                       lifeTimeEarning: Math.round(
//                         parseInt(
//                           Number(
//                             singleDriverProcessingTransactions.amount
//                           ).toFixed(2)
//                         )
//                       ),
//                     },
//                   }
//                 );
//                 break;

//               case "FAILED":
//                 break;

//               default:
//                 break;
//             }
//           }
//         }
//       }
//     }
//     // console.log("waiting")

//     await sleep(45 * 1000);
//     let processingTransactions = await driversWithdrawalModel
//       .find({ status: 1 })
//       .lean();
//     for (const singleDriverProcessingTransactions of processingTransactions) {
//       let singlePaymentStatus = await inquirePayment(
//         singleDriverProcessingTransactions.txnId
//       );

//       switch (singlePaymentStatus.status) {
//         case "PROCESSING":
//           break;

//         case "PROCESSED":
//           await driversWithdrawalModel.findByIdAndUpdate(
//             singleDriverProcessingTransactions._id,
//             {
//               status: 2,
//             }
//           );
//           await driversModel.findByIdAndUpdate(
//             singleDriverProcessingTransactions.driver,
//             {
//               $inc: {
//                 wallet: -Math.round(
//                   parseInt(
//                     Number(
//                       singleDriverProcessingTransactions.amount
//                     ).toFixed(2)
//                   )
//                 ),
//                 lifeTimeEarning: Math.round(
//                   parseInt(
//                     Number(
//                       singleDriverProcessingTransactions.amount
//                     ).toFixed(2)
//                   )
//                 ),
//               },
//             }
//           );
//           break;

//         case "FAILED":
//           break;

//         default:
//           break;
//       }
//     }
//     // console.log("done")
//   } catch (e: any) {
//     logger.error({ error: e, msg: e.message });
//   }
// };

// export const customPayoutEntry = async () => {
//   try {
//     let verifiedDrivers: any = await driversModel
//       .find({
//         "vehicleInfo.isApproved": true,
//         wallet: { $gte: 1 },
//         bankDetails: { $exists: true },
//         _id: {
//           $in: [
//             "68630fb24362c71f72713730",
//           ],
//         },
//       })
//       .lean();
//     for (let singleDriverPaymentDetails of verifiedDrivers) {
//       let transferMoneyObj: any = {
//         "002-10983-1271288": 130.0,
//       };
//       let account_id =
//         decryptPassword(
//           singleDriverPaymentDetails?.bankDetails?.institutionNumber
//         ) +
//         "-" +
//         decryptPassword(
//           singleDriverPaymentDetails?.bankDetails?.transitNumber
//         ) +
//         "-" +
//         decryptPassword(singleDriverPaymentDetails?.bankDetails?.accountNumber);
//       if (
//         account_id === "002-10983-1271288"
//       ) {
//         await driversWithdrawalModel.create({
//           driver: singleDriverPaymentDetails._id,
//           amount: transferMoneyObj[account_id],
//           txnTime: new Date(),
//           txnId: "manual",
//           confirmation_number: "manual",
//           status: 2,
//         });
//         await driversModel.findByIdAndUpdate(singleDriverPaymentDetails._id, {
//           $inc: { wallet: -transferMoneyObj[account_id] },
//         });
//       }
//     }
//   } catch (e: any) {
//     logger.error({ error: e, msg: e.message });
//   }
// };

export const doublePaySameJob = async () => {
  try {
    let driverTransactions = await driversWalletTransactionModel.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
          },
          // description: "tip received"
          // description: "On ride completion"
        },
      },
      {
        $group: {
          _id: {
            bookingId: "$bookingId",
            description: "$description",
            amount: "$amount",
          },
          count: { $sum: 1 },
          docs: { $push: "$$ROOT" },
        },
      },
      {
        $match: { count: { $gt: 1 } },
      },
    ]);

    await Promise.all(
      driverTransactions.map(async (group: any) => {
        group.docs.sort(
          (a: any, b: any) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const duplicates = group.docs.slice(1);
        await Promise.all(
          duplicates.map(async (dup: any) => {
            // console.log(dup, "dup")
            // await driversWalletTransactionModel.deleteOne({ _id: dup._id });
            // if (dup.driver) {
            //   await driversModel.updateOne(
            //     { _id: dup.driver },
            //     { $inc: { wallet: -dup.amount } }
            //   );
            // }
          })
        );
      })
    );
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const deleteUserInRedis = async (userId: string) => {
  try {
    let redis = await getRedis();
    if (redis) {
      await redis?.json?.del(`user:${userId}`);
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const saveDriverNotification = async (driverId: string, notificationData: any, ttlSeconds = 15) => {
  try {
    let redis = await getRedis();
    if (redis) {
      const redisKey = `jobnotification:${driverId}`;
      const exists = await redis.exists(redisKey);
      if (exists) {
        return false;
      }
      await redis.json.set(redisKey, '$', notificationData);
      await redis.expire(redisKey, ttlSeconds);
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
}

export const idExistSaveDriverNotification = async (driverId: string) => {
  try {
    let redis = await getRedis();
    if (redis) {
      const redisKey = `jobnotification:${driverId}`;
      const exists = await redis.exists(redisKey);
      if (exists) {
        return true;
      }
      return false
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
}

export const acquireDriverLock = async (driverId: string): Promise<boolean> => {
  const redis = await getRedis();
  if (!redis) return false;
  const lockKey = `driverlock:${driverId}`;
  const result = await redis.set(lockKey, "locked", {
    NX: true,
    EX: 15,
  });
  return result === "OK";
};

export const acquireJobLock = async (jobId: string) => {
  try {
    let redis = await getRedis();
    if (redis) {
      const redisKey = `joblock:${jobId}`;
      const exists = await redis.exists(redisKey);
      if (exists) {
        return false;
      }
      await redis.json.set(redisKey, '$', {});
      await redis.expire(redisKey, 5);
      return true;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const releaseDriverLock = async (driverId: string) => {
  const redis = await getRedis();
  if (redis) {
    const lockKey = `driverlock:${driverId}`;
    await redis.del(lockKey);
  }
};

export const getDriverNotification = async (driverId: string) => {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const redisKey = `jobnotification:${driverId}`;
    const value: any = await redis.json.get(redisKey, { path: '$' });
    return value ? value[0] : null;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const deleteDriverNotification = async (driverId: string) => {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const redisKey = `jobnotification:${driverId}`;
    await redis?.json?.del(redisKey, { path: '$' });
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const saveDriverMatchNotification = async (driverId: string, bookingId: string, notificationData: any, ttlSeconds = 15 * 60) => {
  try {
    let redis = await getRedis();
    if (redis) {
      const redisKey = `jobInMatchNotification:${driverId}-${bookingId}`;
      await redis.json.set(redisKey, '$', notificationData);
      await redis.expire(redisKey, ttlSeconds);
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
}

export const getDriverMatchNotification = async (driverId: string) => {
  try {
    const redis = await getRedis();
    if (!redis) return [];
    const pattern = `jobInMatchNotification:${driverId}-*`;
    let cursor = "0";
    let allKeys: string[] = [];
    do {
      const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      allKeys = allKeys.concat(reply.keys);
    } while (cursor !== "0");
    if (!allKeys.length) return [];
    const values: any = await redis.json.mGet(allKeys, "$");
    const parsed = values ? values.map((val: any) => {
      try {
        return val ? val[0] : null;
      } catch {
        return null;
      }
    }).filter(Boolean) : [];
    return parsed;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return [];
  }
};

export const deleteMatchNotification = async (driverId?: string, bookingId?: string) => {
  try {
    const redis = await getRedis();
    if (!redis) return null;

    let pattern = "jobInMatchNotification:";
    if (driverId) pattern += `${driverId}-`;
    else pattern += "*-";

    if (bookingId) pattern += bookingId;
    else pattern += "*";

    // Step 1: scan for keys
    let cursor = "0";
    let allKeys: string[] = [];
    do {
      const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      allKeys = allKeys.concat(reply.keys);
    } while (cursor !== "0");

    if (!allKeys.length) return null;
    for (const key of allKeys) {
      await redis?.json?.del(key);
    }

    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return null;
  }
};

export const getNearbyDriversFromRedis = async (
  order: any,
  distanceRadius: number,
  rejectedDriver: string[],
  oneByOneJobExpiryTime: number
) => {
  const longitude = order?.tripAddress[0]?.location?.longitude;
  const latitude = order?.tripAddress[0]?.location?.latitude;
  if (!longitude || !latitude) {
    return []
  }
  const redis = await getRedis();
  const driverIds: any = await redis?.sendCommand([
    "GEOSEARCH",
    "drivers:geo",
    "FROMLONLAT",
    longitude?.toString(),
    latitude?.toString(),
    "BYRADIUS",
    distanceRadius?.toString(),
    "m",
    "ASC",
  ]);
  let drivers: any[] = [];
  for (const driverId of driverIds) {
    const driver: any = await redis?.json?.get(`driver:${driverId}`);
    if (!driver) continue;
    if (
      driver?.iAmOnline !== true ||
      driver?.isDriverUnderPool !== false ||
      driver?.stopFutureRide !== false ||
      driver?.iAmBusy !== false ||
      !driver?.vehicleInfo?.isApproved
    ) {
      continue;
    }
    if (rejectedDriver?.includes(driver?._id.toString())) {
      continue;
    }
    if (
      driver?.missedBookingAt &&
      new Date(driver?.missedBookingAt).getTime() >
      new Date().getTime() - oneByOneJobExpiryTime
    ) {
      continue;
    }
    drivers?.push(driver);
  }
  return drivers;
};

export const findBusyDriversFromRedis = async (
  order: any,
  distanceRadius: number,
  rejectedDriver: string[],
  oneByOneJobExpiryTime: number
) => {
  const longitude = order?.tripAddress[0]?.location?.longitude;
  const latitude = order?.tripAddress[0]?.location?.latitude;
  if (!longitude || !latitude) {
    return []
  }
  const redis = await getRedis();
  const driverResults: any = await redis?.sendCommand([
    "GEOSEARCH",
    "drivers:geo",
    "FROMLONLAT",
    longitude?.toString(),
    latitude?.toString(),
    "BYRADIUS",
    distanceRadius?.toString(),
    "m",
    "ASC",
    "WITHDIST"
  ]);
  let drivers: any[] = [];
  for (const [driverId, distanceStr] of driverResults) {
    const driver: any = await redis?.json?.get(`driver:${driverId}`);
    if (!driver) continue;
    if (
      driver?.iAmOnline !== true ||
      driver?.isDriverUnderPool !== false ||
      driver?.stopFutureRide !== false ||
      driver?.iAmBusy !== true ||
      !driver?.vehicleInfo?.isApproved
    ) {
      continue;
    }
    if (rejectedDriver?.includes(driver?._id?.toString())) {
      continue;
    }
    if (
      driver?.missedBookingAt &&
      new Date(driver?.missedBookingAt).getTime() >
      new Date().getTime() - oneByOneJobExpiryTime
    ) {
      continue;
    }
    drivers?.push({
      ...driver,
      distance: parseFloat(distanceStr) * 1000
    });
  }
  return drivers;
};

export const updateRedisJsonDirect = async (
  exactKey: string,
  updates: Record<string, any>
) => {
  try {
    const redis = await getRedis();
    if (!redis) {
      logger.error({ error: 'Redis connection not available', msg: 'Redis connection not available' });
      return false;
    }

    // VALIDATION: Ensure the target key exists before attempting updates
    const exists = await redis.exists(exactKey);
    if (exists === 0) {
      logger.error({ error: 'Key not found', msg: `Redis key ${exactKey} not found` });
      return false;
    }

    // NORMALIZATION: Convert plain updates to MongoDB $set format
    // Example: { status: 'active' } becomes { $set: { status: 'active' } }
    const normalized: Record<string, any> = { $set: {} };
    for (const k of Object.keys(updates)) {
      if (k.startsWith('$')) normalized[k] = updates[k];
      else normalized.$set[k] = updates[k];
    }

    // OPERATION: Handle $set operations (most common)
    // Sets or updates field values in the JSON document
    if (normalized.$set && Object.keys(normalized.$set).length > 0) {
      for (const [path, value] of Object.entries(normalized.$set)) {
        const jsonPath = path === '' ? '$' : `$.${path}`;
        await redis.json.set(exactKey, jsonPath, value as any);
      }
    }

    // OPERATION: Handle $push operations
    // Appends values to array fields
    if (normalized.$push && Object.keys(normalized.$push).length > 0) {
      for (const [path, value] of Object.entries(normalized.$push)) {
        const jsonPath = path === '' ? '$' : `$.${path}`;
        if (Array.isArray(value)) {
          // Push multiple items individually
          for (const item of value) {
            await redis.json.arrAppend(exactKey, jsonPath, item as any);
          }
        } else {
          // Push single item
          await redis.json.arrAppend(exactKey, jsonPath, value as any);
        }
      }
    }

    // OPERATION: Handle $inc operations
    // Increments numeric field values
    if (normalized.$inc && Object.keys(normalized.$inc).length > 0) {
      for (const [path, incrementValue] of Object.entries(normalized.$inc)) {
        const jsonPath = path === '' ? '$' : `$.${path}`;
        await redis.json.numIncrBy(exactKey, jsonPath, Number(incrementValue || 0));
      }
    }

    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const rideCountAggregation = async () => {
  try {
    const [customerAgg, driverAgg] = await Promise.all([
      rideBookingsModel.aggregate([
        { $match: { tripStatus: 'completed' } },
        { $group: { _id: '$customer', count: { $sum: 1 } } }
      ]),
      rideBookingsModel.aggregate([
        { $match: { tripStatus: 'completed' } },
        { $group: { _id: '$driver', count: { $sum: 1 } } }
      ])
    ]);

    const userBulkOps = customerAgg.map(el => ({
      updateOne: {
        filter: { _id: el._id },
        update: { $set: { rideCount: el.count } }
      }
    }));

    const driverBulkOps = driverAgg.map(el => ({
      updateOne: {
        filter: { _id: el._id },
        update: { $set: { rideCount: el.count } }
      }
    }));
    // console.log("start")

    await Promise.all([
      userBulkOps.length && usersModel.bulkWrite(userBulkOps),
      driverBulkOps.length && driversModel.bulkWrite(driverBulkOps)
    ]);

    // console.log('done');
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
}