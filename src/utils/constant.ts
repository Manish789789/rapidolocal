import driversModel from "@/modules/drivers/models/drivers.model";
import { logger } from "./logger";

export const getPriorityDrivers = async () => {
    try {
        let priorityDriverIds = await driversModel.find({
            'vehicleInfo.isApproved': true,
            iAmOnline: true,
            iAmBusy: false,
            isDriverUnderPool: false,
            $or: [
                {
                    _id: {
                        $in: [
                            "67feb47d887d1e930fd129f0",
                            "67eebf0ccdb1453ecc747fb7",
                            "67e9542514af96c1a2c0bf28",
                            "67907125ff6beeb1b7411822",
                            "6796f5787707eadcd9d33ab4",
                            "67786ec1b210323dd56025cd",
                            "67b5ec72af86f5eb2c245152",
                            "67c56d9c548ae865dab57f21",
                            "67e303627548686afc1e1fb2",
                            '67ec90dccdb1453ecc3402c4',
                            "66c7c646cd6f872c5800026f",
                            "67db0731e31a994b4c6c7fe9",
                            "67f1321b8e80cca532d26068",
                            "67ec90dccdb1453ecc3402c4",
                            "67f26b7961cab88a95d976ea",
                            "679fbc87d04f752b04683443",
                            "672b6c80eacc9460569a3b85",
                            "66c72ff9cd6f872c58ff0e7f",
                            "67cf5d3cf2e58ee70cf7ad9c",
                            "66d62df99c968069a3f31324",
                            "67d898427468d374174d9c2e",
                            "67c22c792184b113ed17c04c",
                            "67d05b93f2e58ee70c086a6a",
                            "67ecb45ccdb1453ecc388756",
                            "66e8c57e5c0cee0ca5559105",
                            "67660f25b210323dd5c0f58d",
                            "67a49751aff9da5b9b4c159e",
                            "67d2e4377468d37417bbb31d",
                            "66f77ebaf985f880b2b8166c",
                            "681162c7a5a61e0dce998ba9",
                            "665a325056eea0d61aeb8f51",
                            "664b7fa257c2aecb993f059f",
                            "66a594545e88ea83c7371708",
                            "67b382f3b499328bd128139d",
                            "66f2fff05c0cee0ca541b88c",
                            "66a2c3ec248e9496083681b7",
                            "66f31ede5c0cee0ca5469575",
                            "665a30cf56eea0d61aeb8ee1",
                            "67f3c5c52b03c9a89b2e2997",
                            "67b10b95b499328bd1fac96d",
                            "681539da880c0a2ce87f2176",
                            "670d2bbf87647606e9d7c209",
                            "66525e4498501b12df74d3f9",
                            "67ad3c75f357a35e0dc7ae33",
                            "66aaa88aeb7bfda741dcd932",
                            "67f462b36e3db98a8399156c",
                            "669d78ec780c2f28f61251f5",
                            "6701b5c5efab87c59a6d242a",
                            "67f1797c8e80cca532de3edf",
                            "67b636baaf86f5eb2c29ba06",
                            "6701b5c5efab87c59a6d242a",
                            "67b636baaf86f5eb2c29ba06",
                            "66c3894bef870ece1beccee3",
                            "669d7928780c2f28f61252e4",
                            "672b6c80eacc9460569a3b85",
                            "67a456d473c84c4e209cd52f" //testing
                        ]
                    }
                },
                {
                    createdAt: {
                        $gte: new Date("2025-03-01T00:00:00Z"),
                    }
                }
            ]
        }, { _id: 1 }).lean();
        const result = priorityDriverIds?.map(driver => driver?._id?.toString());
        return result;
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
    }
}

export const oneByOneJobBeforeMatchTiming = 45 * 1000

export const oneByOneJobExpiryTime = 15 * 1000

export const matchJobExpiryTime = 15 * 1000

export const processJobToNextBeforeTimeDelay = 1 * 1000

export const cancellatinChargesApplyAfterJobCancelByCustomer = 130 * 1000

export const cancellatinChargesApplyAfterJobPickedByDriverButNotArriving = 5 * 60 * 1000

export const cancellatinChargesApplyAfterJobCancelByDriver = 7 * 60 * 1000

export const jobSendByRedis = true

export const HSTNO = '799043534RT0001';

export const waitingChargeRate = .38;

export const missedBookingCountForOffline = 2;

export const findDriverFromRedis = true;

export const TEN_SECONDS = 10000;