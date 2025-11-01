import driversModel from "@/modules/drivers/models/drivers.model";
import rideBookingsModel, { bookingStatus } from "../../models/rideBookings.model";
import cabBookingsSurgeGeoAreaModel from "../../models/cabBookingsSurgeGeoArea.model";
import { logger } from "@/utils/logger";

export const activeBookingsToActiveDrivers = async (givenLat: any, givenLong: any) => {
    let result = { supply: 0, demand: 0, surgeMultiplier: 1 };
    try {
        let activeBookingList = await rideBookingsModel.aggregate(
            [
                {
                    $geoNear: {
                        near: { type: "Point", coordinates: [givenLong, givenLat] },
                        distanceField: "distance",
                        spherical: true,
                        maxDistance: 2000,
                        query: {
                            tripStatus: bookingStatus.finding_driver,
                            paymentStatus: true,
                        }
                    }
                },
                {
                    $sort: {
                        distance: 1,
                    },
                },
            ]
        )

        let driverList = await driversModel.aggregate([
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [givenLong, givenLat],
                    },
                    distanceField: "distance",
                    maxDistance: 3000,
                    spherical: true,
                },
            },
            {
                $match: {
                    iAmOnline: true,
                    iAmBusy: false,
                    "vehicleInfo.isApproved": true,
                },
            },
            {
                $sort: {
                    distance: 1,
                },
            },
        ]);
        result.supply = driverList.length
        result.demand = activeBookingList.length
        return { ...result, surgeMultiplier: getSurgeFromBookingCountAndActiveDriverCount(activeBookingList.length, driverList.length) };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return result;
    }
}

export const getSurgeFromBookingCountAndActiveDriverCount = (bookingCount: any, driverCount: any) => {
    let surgeMultiplier = 1
    try {
        if (bookingCount === 0) {
            surgeMultiplier = 1
            return surgeMultiplier;
        }

        if (driverCount === 0) {
            let differenceBetween = bookingCount - driverCount;
            surgeMultiplier = Math.min((1 + (.1 * differenceBetween)), 2.5)
            return surgeMultiplier;
        }

        let ratio = Number(Number(bookingCount / driverCount).toFixed(1));

        if (ratio <= 1) {
            surgeMultiplier = 1
            return surgeMultiplier;
        } else {
            let differenceBetween = bookingCount - driverCount;
            surgeMultiplier = Math.min((1 + (.1 * differenceBetween)), 2.5)
            return surgeMultiplier;
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return 1
    }
}

export const findActiveBookingsInZone = async (zone: any) => {
    let count = 0;
    try {
        let activeBookings = await rideBookingsModel.find({
            tripStatus: bookingStatus.finding_driver,
            paymentStatus: true,
        }).lean();
        for (const singleActiveBooking of activeBookings) {
            let zoneLoc: any = await getZone(singleActiveBooking?.tripAddress?.[0].location.latitude, singleActiveBooking?.tripAddress?.[0].location.longitude);
            if (zoneLoc) {
                if (zone?._id?.toString() === zoneLoc?._id?.toString()) {
                    count++;
                }
            }
        }
        return count;
    } catch (e) {
        return count;
    }
}

export const findActiveDriversInZone = async (zone: any) => {
    let count = 0;
    try {
        let activeDrivers = await driversModel.find({
            iAmOnline: true,
            iAmBusy: false,
            "vehicleInfo.isApproved": true,
        }).lean();
        for (const singleActiveDriver of activeDrivers) {
            let zoneLoc: any = await getZone(singleActiveDriver?.location?.coordinates[1], singleActiveDriver?.location?.coordinates[0]);
            if (zoneLoc) {
                if (zone?._id?.toString() === zoneLoc?._id?.toString()) {
                    count++;
                }
            }
        }
        return count;
    } catch (e) {
        return count;
    }
}
export const zoneUpdated = async (zone: any, demand = 0, supply = 0) => {
    try {
        let surgeMultiplier = getSurgeFromBookingCountAndActiveDriverCount(demand, supply);
        await cabBookingsSurgeGeoAreaModel.updateOne({ _id: zone?._id }, {
            $set: {
                demand: demand,
                supply: supply,
                surgeMultiplier: surgeMultiplier
            },
        })
    } catch (e) {
        return false;
    }
}
export const surgeCompleteProcessForSingleZone = async (bookingLat: any, bookingLong: any) => {
    try {
        let zone = await getZone(bookingLat, bookingLong);
        if (zone) {
            let activeBookingsCount = await findActiveBookingsInZone(zone);
            let activeDriversCount = await findActiveDriversInZone(zone);
            await zoneUpdated(zone, activeBookingsCount, activeDriversCount);
            return true
        }
    } catch (e) {
        return false;
    }
}

export const getZone = async (givenLat: any, givenLong: any) => {
    try {
        let availableZones = await cabBookingsSurgeGeoAreaModel.findOne({
            geometry: {
                $geoIntersects: {
                    $geometry: {
                        type: "Point",
                        coordinates: [givenLong, givenLat]
                    }
                }
            }
        }).lean();
        return availableZones;
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return [];
    }
}
