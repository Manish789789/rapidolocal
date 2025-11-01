import { resources } from "@/utils/resources";
import model from "../../models/geoAreas.model";
import geoAreasModel from "../../models/geoAreas.model";
import { logger } from "@/utils/logger";
import rideBookingsModel, { bookingStatus } from "@/modules/ride-bookings/models/rideBookings.model";
export const { index, create, edit, update, deleteItem } = resources(model)

export const search = async ({ query, error }: any) => {
    try {

        const { country, search } = query;
        let filter = {};

        if (country) {
            // filter = { countryDetail : country };
        }

        if (search) {
            filter = { ...filter, name: { $regex: search, $options: 'i' } };
        }

        const geoAreas = await geoAreasModel.find(filter).select('name').sort({ name: 1 }).limit(50).lean().then(resources => resources.map((item: any) => ({
            label: item.name,
            value: item._id
        })));

        return {
            success: true,
            data: geoAreas,
            message: "Geo areas fetched successfully"
        };
    } catch (e: any) {
        return error(500, {
            status: 500,
            message: e.message || "Internal Server Error"

        });
    }
}

export const surgeGeoAreas = async ({ request, error }: any) => {
    try {
        let surgeZoneList = await geoAreasModel.find({
            status: true
        }).lean();
        let updatedResults = surgeZoneList?.filter((element: any) => {
            if (element?.surgeMultiplier > 1) {
                return true;
            } else {
                return false
            }
        })
        return { success: true, data: updatedResults };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: 'Internal server error', data: [] })
    }
}

export const heatMapPoints = async ({ request, body, params, error }: any) => {
    try {
        let Points = [];
        Points = await rideBookingsModel.aggregate([
            {
                $match: { tripStatus: bookingStatus.completed },
            },
            {
                $project: {
                    _id: 0,
                    latitude: { $arrayElemAt: ["$tripAddress.location.latitude", 0] },
                    longitude: { $arrayElemAt: ["$tripAddress.location.longitude", 0] },
                    weight: { $literal: 1 },
                },
            },
            // {
            //   $unwind: "$tripAddress" // Unwind the tripAddress array to work with individual locations
            // },
            // {
            //   $addFields: {
            //     geoJson: {
            //       type: "Point",
            //       coordinates: ["$tripAddress.location.longitude", "$tripAddress.location.latitude"]
            //     }
            //   }
            // },
            // {
            //   $group: {
            //     _id: "$_id",
            //     coordinates: { $push: "$geoJson" }
            //   }
            // },
            // {
            //   $project: {
            //     _id: 0,
            //     coordinates: 1
            //   }
            // },
            // {
            //   $unwind: "$coordinates"
            // },
            // {
            //   $geoNear: {
            //     near: "$coordinates",
            //     distanceField: "distance",
            //     maxDistance: 500, // 500 meters range
            //     spherical: true
            //   }
            // },
            // {
            //   $group: {
            //     _id: "$coordinates",
            //     count: { $sum: 1 }
            //   }
            // }
        ]);

        return { success: true, data: Points };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
};

