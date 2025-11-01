import driversModel from "@/modules/drivers/models/drivers.model";
import usersModel from "@/modules/users/models/users.model";
import { logger } from "./logger";
import { sendSocket } from "./websocket";
import { sendToDriverSocket } from "@/plugins/websocket/websocket.plugin";

export const getDriverSocketId = async (driverId: any) => {
    let driverRes = await driversModel.findOne({
        _id: driverId
    })
    return driverRes?.socket_id;
}

export const getuserSocketId = async (userId: any) => {
    let userRes = await usersModel.findOne({
        _id: userId
    })
    return userRes?.socket_id;
}

export const surgeUpdated = async () => {
    try {
        let driverList = await driversModel.aggregate([
            {
                $match: {
                    iAmOnline: true,
                    iAmBusy: false,
                    "vehicleInfo.isApproved": true,
                    socket_id: { $ne: null }
                },
            },
        ]);
        for (const element of driverList) {
            // sendSocket([element._id], "surgeUpdated", {});
            sendToDriverSocket(element?._id?.toString(), {
                event: "surgeUpdated",
                data: {}
            })
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return false;
    }
}