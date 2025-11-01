import { logger } from "@/utils/logger";
import geoZonesModel from "../../models/geoZones.model";

export const getGeoZonesForPickDrop = async ({ body, error }: any) => {
    try {
        let availableZones = await geoZonesModel.find({ status: true }).lean();
        return {
            success: true,
            message: `Geo Zones Available`,
            data: availableZones
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
            success: false, message: 'Internal server error'
        })
    }

}