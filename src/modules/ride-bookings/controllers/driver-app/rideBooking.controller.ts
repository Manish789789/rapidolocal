import { logger } from "@/utils/logger";
import rideBookingsModel, { bookingStatus, generatePoolId } from "../../models/rideBookings.model";
import { getDirections, getDirectionsDistanceTime, getDistanceTime, getNearByDrivers } from "@/utils/map/mapboxHelper";
import { generateInviteCode, generateRandomNumbers, isFloat } from "@/utils";
import { pagination } from "@/utils/resources";
import driversModel from "@/modules/drivers/models/drivers.model";
import { sendToDriverPushNotification } from "@/modules/drivers/controllers/admin/pushnotification.controller";
import { sendToCustomerPushNotification } from "@/modules/users/controllers/user-app/pushnotification.controller";
import { findNearDriver, matchJobProcessStart } from "@/modules/drivers/controllers/admin/cron.controller";
import { surgeUpdated } from '@/utils/fetchSocketId';
import { surgeCompleteProcessForSingleZone } from '../helpers/surge.controller';
import moment from "moment";
import { setUpForVoiceCall } from "@/utils/callAgora";
import bookingChatModel from "../../models/bookingChatModel";
import couponsModel from "@/modules/coupons/models/coupons.model";
import usersModel from "@/modules/users/models/users.model";
import driversWalletTransactionModel from "@/modules/drivers/models/driversWalletTransaction.model";
import { createSquarePayment, squareCompletePayment, squarePaymentStatus } from "@/modules/paymentGateways/square.controller";
import { autoDeductExtraChargesFromCustomer, capturePaymentIntent, getPaymentIntentRetrievalResult } from "@/modules/paymentGateways/stripe.controller";
import { placeDriverBilling } from "../helpers/helperBilling.controller";
import { sendSocket, sendToAllUsers } from "@/utils/websocket";
import { cancellatinChargesApplyAfterJobCancelByDriver, jobSendByRedis, waitingChargeRate } from "@/utils/constant";
import { deleteDriverNotification, deleteMatchNotification, findMatchingBookingsFromRedis, getActiveBookingCountFromRedis, getActiveBookingCountOnThewayArrivedFromRedis, getActiveBookingFromRedis, getBookingFromRedis, getDriverMatchNotification, getDriverNotification, getNearbyBookingFromRedis, getPickedBookingsForDriverFromRedis, getSecondActiveBookingFromRedis, getUserLocFromRedis, isBokingReqSendForDriverFromRedis, renameKeyInRedis, updateBookingInRedis, updateBookingWithKeyRename } from "@/utils/redisHelper";
import { findNearDriverFromRedis, matchJobProcessStartFromRedis } from "@/modules/drivers/controllers/admin/cronRedis.controller";
import { getRedis } from "@/plugins/redis/redis.plugin";
import { sendToDriverSocket, sendToUserSocket } from "@/plugins/websocket/websocket.plugin";
import activityLogsModel from "@/modules/activityLogs/models/activityLogs.model";
import userWalletTransactionsModel from "@/modules/users/models/userWalletTransactions.model";

export const getCurrentActiveBooking = async ({ request, body, error }: any) => {
    try {
        let data = null;
        if (jobSendByRedis) {
            data = await getActiveBookingFromRedis(request?.user?._id)
        } else {
            data = await rideBookingsModel
                .findOne({
                    driver: request?.user?._id,
                    tripStatus: {
                        $nin: [bookingStatus.canceled, bookingStatus.completed],
                    },
                    paymentStatus: true,
                    $or: [
                        { "scheduled.scheduledAt": null },
                        {
                            $and: [
                                { "scheduled.scheduledAt": { $ne: null } },
                                { "scheduled.startRide": true }
                            ],
                        },
                    ],
                })
                .populate("vehicleType customer")
                .select("-rejectedDriver")
                .lean();
        }

        if (data) {
            // sendSocket(request?.user?._id?.toString(), "singlebookingStatusUpdated", { bookingId: data?._id })
            sendToDriverSocket(request?.user?._id?.toString(), {
                event: "singlebookingStatusUpdated",
                data: { bookingId: data?._id }
            })
            return {
                success: true,
                data: data,
            };
        }
        return {
            success: true,
            data: null,
        };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: [], message: "0 booking" })
    }
}

export const checkDriverNewBooking = async ({ request, body, error }: any) => {
    try {
        let bookingList = []
        let response: any = await getDriverNotification(request.user._id)
        return {
            success: true,
            data: response
        }
        if (jobSendByRedis) {
            bookingList = await getNearbyBookingFromRedis(request.user);
        } else {
            bookingList = await rideBookingsModel.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [
                                request.user?.location?.coordinates[0],
                                request.user?.location?.coordinates[1],
                            ],
                        },
                        distanceField: "distance",
                        spherical: true,
                        maxDistance: 50000,
                        query: {
                            tripStatus: { $in: [bookingStatus.finding_driver, bookingStatus.ontheway] },
                            "askDriver.driver": request?.user?._id,
                            "askDriver.expTime": { $gte: new Date() },
                            rejectedDriver: {
                                $ne: request?.user?._id,
                            },
                            missedJobRequestDrivers: {
                                $ne: request?.user?._id,
                            },
                            paymentStatus: true,
                        }
                    }
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "customer",
                        foreignField: "_id",
                        as: "customer",
                    },
                },
                {
                    $unwind: "$customer",
                },
                {
                    $sort: {
                        distance: 1,
                    },
                },
                {
                    $limit: 1,
                },
            ]);
        }

        if (bookingList.length > 0) {
            const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
                request?.user?._id,
                bookingList[0].tripAddress
            );

            let response = {
                ...bookingList[0],
                customer: {
                    ...bookingList[0].customer,
                    distance: Distancekm,
                    time: DurationMin,
                },
                askDriver: {
                    expTime: bookingList[0].askDriver.expTime
                },
            }
            let checkedBusyDriverDroppedLoc = null
            if (jobSendByRedis) {
                checkedBusyDriverDroppedLoc = await getPickedBookingsForDriverFromRedis(request?.user?._id);
            } else {
                checkedBusyDriverDroppedLoc = await rideBookingsModel.findOne({ driver: request?.user?._id, tripStatus: bookingStatus.picked, paymentStatus: true }).lean();
            }

            if (checkedBusyDriverDroppedLoc) {
                let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(checkedBusyDriverDroppedLoc?.tripAddress, bookingList[0]?.tripAddress);
                response = { ...response, DistancekmCheck, DurationMinCheck }
            }

            return {
                success: true,
                data: response
            }
        } else {
            return { success: false, data: null };
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
}

export const getMatchedBooking = async ({ request, body, error }: any) => {
    try {
        if (request.user.iAmBusy || !request.user.iAmOnline) {
            return { success: true, data: [] };
        }

        const newBookingList = await getDriverMatchNotification(request?.user?._id)
        let responseArray = []
        for (const singleBooking of newBookingList) {
            const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
                request?.user?._id,
                singleBooking.tripAddress
            );

            let response = {
                ...singleBooking,
                customer: {
                    ...singleBooking.customer,
                    distance: Distancekm,
                    time: DurationMin,
                },
            }
            responseArray.push(response)
        }
        // console.log(responseArray.length, "length")

        if (responseArray.length == 0) {
            let isBookingReqSend = null
            if (jobSendByRedis) {
                isBookingReqSend = await isBokingReqSendForDriverFromRedis(request?.user?._id)
            } else {
                isBookingReqSend = await rideBookingsModel.findOne({
                    tripStatus: { $in: [bookingStatus.finding_driver, bookingStatus.ontheway] },
                    "askDriver.driver": request?.user?._id,
                    "askDriver.expTime": { $gte: new Date() },
                    rejectedDriver: {
                        $ne: request?.user?._id,
                    },
                    missedJobRequestDrivers: {
                        $ne: request?.user?._id,
                    },
                    paymentStatus: true,
                })
            }

            if (isBookingReqSend) {
                return { success: true, data: [] };
            }
            let bookingList: any = [];
            if (jobSendByRedis) {
                bookingList = await findMatchingBookingsFromRedis(request);
            } else {
                bookingList = await rideBookingsModel.aggregate([
                    {
                        $geoNear: {
                            near: {
                                type: "Point",
                                coordinates: [
                                    request.user?.location?.coordinates[0],
                                    request.user?.location?.coordinates[1],
                                ],
                            },
                            distanceField: "distance",
                            spherical: true,
                            maxDistance: 50000,
                            query: {
                                tripStatus: { $in: [bookingStatus.finding_driver, bookingStatus.ontheway] },
                                rejectedDriver: {
                                    $ne: request?.user?._id,
                                },
                                $and: [
                                    {
                                        $or: [
                                            { "scheduled.scheduledAt": null },
                                            {
                                                $expr: {
                                                    $lt: [
                                                        "$scheduled.scheduledAt",
                                                        { $add: [new Date(), 1000 * 60 * 10] }
                                                    ]
                                                }
                                            }
                                        ]
                                    },
                                    {
                                        $or: [
                                            { "askDriver.driver": { $ne: request?.user?._id } },
                                            { "askDriver.expTime": { $lt: new Date() } },
                                        ]
                                    }
                                ],
                                paymentStatus: true,
                            }
                        }
                    },
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    {
                                        $lt: ["$distance", { $multiply: ["$matchJobDistance", 1000] }]
                                    },
                                    {
                                        $in: [request?.user?._id, "$priorityDrivers"]
                                    }
                                ]
                            }
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "customer",
                            foreignField: "_id",
                            as: "customer",
                        },
                    },
                    {
                        $unwind: "$customer",
                    },
                    {
                        $sort: {
                            distance: -1,
                        },
                    },
                    {
                        $limit: 10,
                    },
                ]);
            }
            let newBookingList = []
            for (const singleBooking of bookingList) {
                if (singleBooking.tripStatus === bookingStatus.finding_driver) {
                    newBookingList.push(singleBooking)
                } else {
                    let hasTwoJobsAssigned = null
                    if (jobSendByRedis) {
                        hasTwoJobsAssigned = await getPickedBookingsForDriverFromRedis(singleBooking.driver);
                    } else {
                        hasTwoJobsAssigned = await rideBookingsModel.findOne({ driver: singleBooking.driver, tripStatus: bookingStatus.picked, paymentStatus: true }).lean();
                    }
                    if (hasTwoJobsAssigned) {
                        newBookingList.push(singleBooking)
                    }
                }
            }

            responseArray = []
            for (const singleBooking of newBookingList) {
                const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
                    request?.user?._id,
                    singleBooking.tripAddress
                );

                let response = {
                    ...singleBooking,
                    customer: {
                        ...singleBooking.customer,
                        distance: Distancekm,
                        time: DurationMin,
                    },
                }
                responseArray.push(response)
            }
        }

        return {
            success: true,
            data: responseArray
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: [] })
    }
}

export const mybookings = async ({ request, body, error }: any) => {
    try {
        if (body.isScheduled) {
            var limit =
                typeof body.perPage == "undefined" ? 10 : body.perPage;
            var page = typeof body.page == "undefined" ? 1 : body.page;

            let scheduledList = await rideBookingsModel.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: "Point",
                            coordinates: [
                                request.user?.location?.coordinates[0],
                                request.user?.location?.coordinates[1],
                            ],
                        },
                        distanceField: "distance",
                        spherical: true,
                        maxDistance: 50000,
                        query: {
                            paymentStatus: true,
                            "scheduled.isScheduled": true,
                            tripStatus: {
                                $nin: [
                                    bookingStatus.canceled,
                                    bookingStatus.completed,
                                ],
                            },
                            $or: [
                                {
                                    driver: request?.user?._id,
                                },
                                { tripStatus: bookingStatus.finding_driver },
                            ],
                        },
                    },
                },
                {
                    $addFields: {
                        tripStatusPriority: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$tripStatus", bookingStatus.picked] }, then: 1 },
                                    { case: { $eq: ["$tripStatus", bookingStatus.arrived] }, then: 2 },
                                    { case: { $eq: ["$tripStatus", bookingStatus.ontheway] }, then: 3 },
                                    { case: { $eq: ["$tripStatus", bookingStatus.finding_driver] }, then: 4 },
                                ],
                                default: 5,
                            },
                        },
                    },
                },
                {
                    $sort: {
                        tripStatusPriority: 1,
                        "scheduled.scheduledAt": 1,
                        distance: 1,
                        createdAt: -1,
                    },
                },
                {
                    $facet: {
                        totalCount: [{ $count: "count" }],
                        paginatedResults: [
                            { $skip: limit * (page - 1) },
                            { $limit: limit },
                        ],
                    },
                },
                { $unwind: "$totalCount" },
                {
                    $replaceRoot: {
                        newRoot: {
                            $mergeObjects: [
                                "$totalCount",
                                { paginatedResults: "$paginatedResults" },
                            ],
                        },
                    },
                },
            ]);

            if (scheduledList.length === 0) {
                return {
                    success: true,
                    data: {
                        pages: 0,
                        total: 0,
                        currentPage: 1,
                        lists: [],
                    },
                };
            }

            var totalPages: string | any = parseInt(scheduledList[0].count) / limit;

            let resData = {
                pages: isFloat(totalPages) ? parseInt(totalPages) + 1 : totalPages,
                total: scheduledList[0].count,
                currentPage: page,
                lists: scheduledList[0].paginatedResults,
            };

            return {
                success: true,
                data: resData,
            };
        } else {
            body = {
                ...body,
                filter: {
                    ...body.filter,
                    driver: request?.user?._id,
                    tripStatus: {
                        $in: [
                            bookingStatus.completed,
                            bookingStatus.canceled,
                        ],
                    },
                },
            };
            return {
                success: true,
                data: await pagination(body, rideBookingsModel),
            };
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return {
            success: false,
            data: {
                pages: 0,
                total: 0,
                currentPage: 0,
                lists: [],
            },
            message: "0 trips",
        };
    }
};

export const callCreationTwillo = async ({ request, body, error }: any) => {
    try {
        let orderDetails = await rideBookingsModel
            .findOne({ _id: body.bookingId })
            .populate("customer driver");

        // const call = await client.calls.create({
        //     from: process.env.TWILLO_MOBILE_NUMBER,
        //     // to: orderDetails?.customer?.phone === request?.user?.phone ? `+91${orderDetails?.driver?.phone}` : `+91${orderDetails?.customer?.phone}`,
        //     to: '+917060810244',
        //     // url: 'https://rapidoride.webin10.com/backend/api/v1/cab-bookings/callWebhook',
        //     method: 'POST',
        //     // twiml: `<Response><Dial>${orderDetails?.customer?.phone === request?.user?.phone ? `+91${orderDetails?.customer?.phone}` : `+91${orderDetails?.driver?.phone}`}</Dial></Response>`
        //     // twiml: `<Response><Dial>${"+917527929767"}</Dial></Response>`
        // });

        // const call = await client.calls.create({
        //     from: process.env.TWILLO_MOBILE_NUMBER,
        //     to: "+917060810244",
        //     url: 'https://25f4-2405-201-5023-4010-5053-8797-ec9c-7cb4.ngrok-free.app/backend/api/v1/cab-bookings/callWebhook',
        //     method: 'POST',
        //     // twiml: `<Response><Dial>${orderDetails?.customer?.phone === request?.user?.phone ? `+91${orderDetails?.customer?.phone}` : `+91${orderDetails?.driver?.phone}`}</Dial></Response>`
        // });

        // const numbersToForward = body.numbers.split(','); // Get the list of numbers from request (comma-separated)

        // const twiml = new twilio.twiml.VoiceResponse();

        // // Dial multiple numbers simultaneously
        // const dial = twiml.dial();
        // dial.number("+917060810244");
        // // numbersToForward.forEach(number => {
        // //     dial.number(number);  // Add each number dynamically
        // // });

        // // Send the TwiML response to Twilio to forward the call
        // res.type('text/xml');
        // res.send(twiml.toString());

        // return res.send();

        // const twiml = new twilio.twiml.VoiceResponse();
        // twiml.say('Connecting your call, please wait...');
        // const dial = twiml.dial();
        // dial.number('+917527929767');
        // res.type('text/xml');
        // return res.status(200).json({ success: true, data: twiml.toString() });

        // const twilioClient = context.getTwilioClient();
        // // Query parameters or values sent in a POST body can be accessed from `event`
        // const from = event.From || '+15017122661';
        // const to = event.To || '+15558675310';
        // // Note that TwiML can be hosted at a URL and accessed by Twilio
        // const url = event.Url || 'http://demo.twilio.com/docs/voice.xml';

        // Use `calls.create` to place a phone call. Be sure to chain with `then`
        // and `catch` to properly handle the promise and call `callback` _after_ the
        // call is placed successfully!
        // await twilioClient.calls
        //     .create({ to, from, url })

        return { message: "Call initiated successfully", callSid: "call.sid" };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: `Call not available` })
    }
    // const { userPhone, driverPhone } = body;

    // try {
    //     // Create a proxy session
    //     const session = await client.proxy.services(serviceSid).sessions.create({
    //         uniqueName: `session-${Date.now()}`
    //     });

    //     // Add user to the session
    //     await client.proxy.services(serviceSid)
    //         .sessions(session.sid)
    //         .participants.create({ identifier: "+91 7060810244" });

    //     // Add driver to the session
    //     await client.proxy.services(serviceSid)
    //         .sessions(session.sid)
    //         .participants.create({ identifier: "driverPhone" });

    //     res.status(200).json({
    //         success: true,
    //         message: 'Proxy session created',
    //         sessionSid: session.sid
    //     });
    // } catch (e) {
    //     res.status(500).json({ success: false, error: e.message });
    // }
};

export const declineNewJobRequest = async ({ request, body, params, error }: any) => {
    if (jobSendByRedis) {
        await updateBookingInRedis(params.id, {
            $push: { rejectedDriver: request?.user?._id },
            askDriver: {
                driver: null,
                expTime: null,
            },
        })
        await deleteDriverNotification(request?.user?._id)
        await deleteMatchNotification(request?.user?._id?.toString(), params.id?.toString())
    } else {
        await rideBookingsModel.updateOne(
            { _id: params.id, rejectedDriver: { $ne: request?.user?._id } },
            {
                $push: { rejectedDriver: request?.user?._id },
                askDriver: {
                    driver: null,
                    expTime: null,
                },
            }
        );
    }

    await driversModel.updateOne({ _id: request?.user?._id }, {
        missedBookingCount: 0,
        iAmOnline: true,
        missedBookingAt: null,
    })
    let OrderDetail: any = {}
    if (jobSendByRedis) {
        OrderDetail = await getBookingFromRedis(params.id)
    } else {
        OrderDetail = await rideBookingsModel
            .findOne({ _id: params.id })
            .populate("customer")
            .lean();
    }


    if (!OrderDetail?.scheduled?.scheduledAt || (OrderDetail.scheduled?.isScheduled && OrderDetail.scheduled?.scheduledAt && (OrderDetail.scheduled?.scheduledAt < new Date(Date.now() + 10 * 60 * 1000)) && (new Date(OrderDetail.scheduled?.scheduledAt) > new Date(Date.now() + 5 * 60 * 1000)))) {
        if (jobSendByRedis) {
            findNearDriverFromRedis(OrderDetail)
            matchJobProcessStartFromRedis(OrderDetail)
        } else {
            findNearDriver(OrderDetail);
            matchJobProcessStart(OrderDetail);
        }
        surgeUpdated()
        surgeCompleteProcessForSingleZone(OrderDetail?.tripAddress[0].location.latitude, OrderDetail?.tripAddress[0].location.longitude)
    }

    return { success: true, message: "Job successfully declined" };
};

export const acceptNewBooking = async ({ request, redis, params, error }: any) => {
    if (jobSendByRedis) {
        try {
            let bookingData: any = await getBookingFromRedis(params.id)
            if (!bookingData) {
                return error(404, {
                    success: false,
                    message: "Job not found",
                })
            }

            if (bookingData &&
                (bookingData?.tripStatus?.toLowerCase() === bookingStatus.finding_driver || bookingData?.tripStatus?.toLowerCase() == bookingStatus.ontheway)
            ) {
                if (bookingData?.tripStatus?.toLowerCase() == bookingStatus.ontheway) {
                    const hasTwoJobsAssigned: any = await rideBookingsModel.findOne({ driver: bookingData.driver, tripStatus: bookingStatus.picked, paymentStatus: true }).populate("driver").lean();

                    if (!hasTwoJobsAssigned) {
                        return error(400, {
                            success: false,
                            message: "Job has been matched with another driver",
                        })
                    }

                    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(request?.user?._id, bookingData?.tripAddress);
                    if (Distancekm >= bookingData.matchJobDistance) {
                        return error(400, {
                            success: false,
                            message: "Job has been matched with another driver",
                        })
                    }
                    sendToDriverPushNotification(String(bookingData?.driver?._id || bookingData?.driver), {
                        notification: {
                            title: "Job Cancelled",
                            body: "Your second job has been cancelled by customer",
                        },
                        data: {},
                    })
                    // sendSocket(bookingData?.driver?._id?.toString(), "singlebookingStatusUpdated", { bookingId: bookingData._id });
                    sendToDriverSocket(bookingData?.driver?._id?.toString(), {
                        event: "singlebookingStatusUpdated",
                        data: { bookingId: bookingData._id }
                    })
                }

                const activeBookingCount = await getActiveBookingCountOnThewayArrivedFromRedis(request?.user?._id)

                if (activeBookingCount >= 1) {
                    return error(400, {
                        success: false,
                        message: "You already have an active booking",
                    })
                }

                // if (bookingData?.carPoolDetails?.isBookingUnderPool) {
                //     let isDriverUnderPool: any = await rideBookingsModel.findOne({
                //         paymentStatus: true,
                //         tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                //         "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                //         "carPoolDetails.bookingPoolDetails.endTime": null,
                //         driver: request?.user?._id,
                //     }).lean()
                //     if (isDriverUnderPool && ((isDriverUnderPool.carPoolDetails.bookingPoolDetails.currentPassengers + bookingData?.switchRider?.passenger) > isDriverUnderPool.carPoolDetails.bookingPoolDetails.maxCapacity)) {
                //         return error(400, {
                //             success: false,
                //             message: "Pool is already allocated",
                //         })
                //     }
                // }

                const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
                    request?.user?._id,
                    bookingData.tripAddress
                );
                // PERFORMANCE OPTIMIZATION: Combined update + key rename operation
                // 
                // Problem: Original code used separate operations:
                // 1. updateBookingInRedis() - ~3800ms (expensive pattern scanning)
                // 2. renameKeyInRedis() - ~800ms (another expensive operation)
                // Total: ~4600ms for driver assignment
                //
                // Solution: Single atomic operation that:
                // - Gets existing booking data (leverages caching)
                // - Creates new Redis key: booking:ID-customerID-driverID  
                // - Updates data and renames key in one operation
                // - Clears cache to maintain consistency
                //
                // Performance Impact: ~4600ms → ~400ms (91% improvement)
                // console.time("updateBookingWithKeyRename");
                await updateBookingWithKeyRename(params.id, {
                    driver: request?.user,
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
                }, request?.user?._id); // Pass new driver ID for atomic key rename

                // OPTIMIZATION: Removed separate renameKeyInRedis call 
                // The key rename is now handled atomically in updateBookingWithKeyRename()

                rideBookingsModel.updateOne({ _id: params.id }, {
                    driver: request?.user?._id,
                    "askDriver.driver": null,
                    "askDriver.expTime": null,
                    tripStatus: bookingStatus.ontheway,
                    acceptedAt: new Date(),
                    canceledByDriver: null,
                    driverCanceledReason: null,
                    pickUpKm: Distancekm,
                    pickUpTime: Number(DurationMin.split(" ")[0])
                }).exec()

                // await saveBookingInDriverRedis(params.id, request?.user?._id);

                driversModel.updateOne({ _id: request?.user?._id },
                    !bookingData?.scheduled?.scheduledAt ? {
                        iAmBusy: true,
                        missedBookingCount: 0,
                        missedBookingAt: null,
                        iAmOnline: true,
                    } : {
                        missedBookingCount: 0,
                        missedBookingAt: null,
                        iAmOnline: true,
                    }
                ).exec()

                await deleteDriverNotification(request?.user?._id)
                await deleteMatchNotification("*", params.id?.toString())
                if (bookingData?.customer?._id) {
                    sendToCustomerPushNotification(
                        String(bookingData?.customer?._id),
                        {
                            notification: {
                                title: `Driver accepted your booking`,
                                body: "Your booking successfully placed.",
                            },
                            data: {
                                notificationType: "bookingPlaces",
                                bookingId: bookingData._id,
                            },
                        }
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
                        if (String(request?.user?._id) !== String(singleDriver._id)) {
                            sendToDriverPushNotification(singleDriver._id, {
                                data: {
                                    notificationType: "jobInSchdule",
                                },
                            });
                            sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                                event: "jobInSchdule",
                                data: {}
                            })
                        }
                    }
                }

                let rejectedDriver: any = bookingData?.rejectedDriver || [];
                rejectedDriver = [
                    ...new Set(rejectedDriver?.map((itm: any) => itm?.toString())),
                ];

                let drivers = await getNearByDrivers([{ location: { latitude: bookingData.tripAddress[0].location.latitude, longitude: bookingData.tripAddress[0].location.longitude } }], 50000, [false], 0, rejectedDriver);
                for (const singleDriver of drivers) {
                    sendToDriverPushNotification(singleDriver._id, {
                        data: {
                            notificationType: 'jobInMatch'
                        }
                    })
                    // sendSocket(singleDriver?.driver?._id?.toString(), "jobInMatch", {})
                    sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                        event: "jobInMatch",
                        data: {}
                    })
                }
                await deleteMatchNotification("*", bookingData?._id?.toString())

                // if (bookingData?.carPoolDetails?.isBookingUnderPool) {
                //     let isDriverUnderPool = await rideBookingsModel.findOne({
                //         paymentStatus: true,
                //         tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                //         "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                //         "carPoolDetails.bookingPoolDetails.endTime": null,
                //         driver: request?.user?._id,
                //     }).lean()
                //     if (isDriverUnderPool) {
                //         await rideBookingsModel.updateOne({ _id: params.id }, {
                //             $set: {
                //                 "carPoolDetails.bookingPoolDetails": {
                //                     poolId: isDriverUnderPool?.carPoolDetails?.bookingPoolDetails?.poolId,
                //                 }
                //             },
                //         })
                //         await rideBookingsModel.updateOne({ _id: isDriverUnderPool._id }, {
                //             $addToSet: { "carPoolDetails.bookingPoolDetails.bookingIds": params.id },
                //             $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": bookingData?.switchRider?.passenger }
                //         })
                //         sendSocket(request?.user?._id?.toString(), "poolUpdated", { poolId: isDriverUnderPool?.carPoolDetails?.bookingPoolDetails?.poolId });
                //     } else {
                //         await rideBookingsModel.updateOne({ _id: params.id }, {
                //             $set: {
                //                 "carPoolDetails.bookingPoolDetails": {
                //                     poolId: generatePoolId(),
                //                     bookingIds: [params.id],
                //                     maxCapacity: 4,
                //                     currentPassengers: bookingData?.switchRider?.passenger,
                //                     startTime: new Date(),
                //                     endTime: null
                //                 }
                //             },
                //         })
                //     }
                // }

                sendToAllUsers("DriverLocationUpdate", {
                    driverId: request?.user?._id,
                    location: {
                        type: "Point",
                        coordinates: [
                            request?.user?.location?.coordinates[0] || 0,
                            request?.user?.location?.coordinates[1] || 0,
                        ],
                    },
                    heading: request?.user?.heading,
                })

                surgeUpdated()
                surgeCompleteProcessForSingleZone(bookingData?.tripAddress[0].location.latitude, bookingData?.tripAddress[0].location.longitude)
                // sendSocket(bookingData?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id })
                sendToUserSocket(bookingData?.customer?._id?.toString(), {
                    event: "singlebookingStatusUpdated",
                    data: { bookingId: params.id }
                })
                // const checkedBusyDriverDroppedLoc = await rideBookingsModel.findOne({ driver: request?.user?._id, tripStatus: bookingStatus.picked, paymentStatus: true }).lean()
                // if (checkedBusyDriverDroppedLoc) {
                //     let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(checkedBusyDriverDroppedLoc?.tripAddress, bookingData?.tripAddress);
                //     let { Distancekm, DurationMin } = await getDirectionsDistanceTime(request?.user?._id, checkedBusyDriverDroppedLoc?.tripAddress, true);
                //     const sumOfDistance = DistancekmCheck + Distancekm;
                //     await rideBookingsModel.updateOne({ _id: bookingData._id }, { matchJobDistance: sumOfDistance });
                // }

                sendToDriverPushNotification(request?.user?._id, {
                    notification: {
                        title: "Assigned New Job",
                        body: "You have been assigned new job",
                    },
                    data: {},
                });

                bookingData = await getBookingFromRedis(params.id)
                return {
                    success: true,
                    message: "Job successfully assigned",
                    data: bookingData,
                };
            } else {
                return error(400, { success: false, message: "Job has been matched with another driver", data: null })
            }
        } catch (e: any) {
            logger.error({ error: e, msg: e.message });
            return error(400, { success: false, message: "Job assigning failed", data: null })
        }
    } else {
        try {
            let bookingData: any = await rideBookingsModel
                .findOne({ _id: params.id })
                .populate("customer")
                .lean();

            if (
                bookingData &&
                (bookingData?.tripStatus?.toLowerCase() === bookingStatus.finding_driver || bookingData?.tripStatus?.toLowerCase() == bookingStatus.ontheway)
            ) {
                if (bookingData?.tripStatus?.toLowerCase() == bookingStatus.ontheway) {
                    const hasTwoJobsAssigned: any = await rideBookingsModel.findOne({ driver: bookingData.driver, tripStatus: bookingStatus.picked, paymentStatus: true }).populate("driver").lean();
                    if (!hasTwoJobsAssigned) {
                        return error(400, {
                            success: false,
                            message: "Job has been matched with another driver",
                        })
                    }
                    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(request?.user?._id, bookingData?.tripAddress);
                    if (Distancekm >= bookingData.matchJobDistance) {
                        return error(400, {
                            success: false,
                            message: "Job has been matched with another driver",
                        })
                    }
                    sendToDriverPushNotification(String(bookingData.driver), {
                        notification: {
                            title: "Job Cancelled",
                            body: "Your second job has been cancelled by customer",
                        },
                        data: {},
                    })
                    // sendSocket(hasTwoJobsAssigned?.driver?._id?.toString(), "singlebookingStatusUpdated", { bookingId: hasTwoJobsAssigned._id });
                    sendToDriverSocket(hasTwoJobsAssigned?.driver?._id?.toString(), {
                        event: "singlebookingStatusUpdated",
                        data: { bookingId: hasTwoJobsAssigned._id }
                    })
                }

                const activeBookingCount = await rideBookingsModel.countDocuments({
                    driver: request?.user?._id,
                    paymentStatus: true,
                    tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.arrived] },
                    $or: [
                        { "scheduled.scheduledAt": null },
                        {
                            $and: [
                                { "scheduled.scheduledAt": { $ne: null } },
                                { "scheduled.startRide": true }
                            ],
                        },
                    ],
                });

                if (activeBookingCount >= 2) {
                    return error(400, {
                        success: false,
                        message: "You already have an active booking",
                    })
                }

                if (bookingData?.carPoolDetails?.isBookingUnderPool) {
                    let isDriverUnderPool: any = await rideBookingsModel.findOne({
                        paymentStatus: true,
                        tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                        "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                        "carPoolDetails.bookingPoolDetails.endTime": null,
                        driver: request?.user?._id,
                    }).lean()
                    if (isDriverUnderPool && ((isDriverUnderPool.carPoolDetails.bookingPoolDetails.currentPassengers + bookingData?.switchRider?.passenger) > isDriverUnderPool.carPoolDetails.bookingPoolDetails.maxCapacity)) {
                        return error(400, {
                            success: false,
                            message: "Pool is already allocated",
                        })
                    }
                }

                const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
                    request?.user?._id,
                    bookingData.tripAddress
                );

                await rideBookingsModel.updateOne({ _id: params.id }, {
                    driver: request?.user?._id,
                    "askDriver.driver": null,
                    "askDriver.expTime": null,
                    tripStatus: bookingStatus.ontheway,
                    acceptedAt: new Date(),
                    canceledByDriver: null,
                    driverCanceledReason: null,
                    pickUpKm: Distancekm,
                    pickUpTime: Number(DurationMin.split(" ")[0])
                })

                if (!bookingData?.scheduled?.scheduledAt) {
                    await driversModel.updateOne(
                        { _id: request?.user?._id },
                        {
                            iAmBusy: true,
                            missedBookingCount: 0,
                            missedBookingAt: null,
                            iAmOnline: true,
                        }
                    )
                } else {
                    await driversModel.updateOne(
                        { _id: request?.user?._id },
                        {
                            missedBookingCount: 0,
                            missedBookingAt: null,
                            iAmOnline: true,
                        }
                    )
                }

                if (bookingData?.customer?._id) {
                    sendToCustomerPushNotification(
                        String(bookingData?.customer?._id),
                        {
                            notification: {
                                title: `Driver accepted your booking`,
                                body: "Your booking successfully placed.",
                            },
                            data: {
                                notificationType: "bookingPlaces",
                                bookingId: bookingData._id,
                            },
                        }
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
                        if (String(request?.user?._id) !== String(singleDriver._id)) {
                            sendToDriverPushNotification(singleDriver._id, {
                                data: {
                                    notificationType: "jobInSchdule",
                                },
                            });
                            // sendSocket(singleDriver?.driver?._id?.toString(), "jobInSchdule", {})
                            sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                                event: "jobInSchdule",
                                data: {}
                            })
                        }
                    }
                }

                let rejectedDriver: any = bookingData?.rejectedDriver || [];
                rejectedDriver = [
                    ...new Set(rejectedDriver?.map((itm: any) => itm?.toString())),
                ];

                let drivers = await getNearByDrivers([{ location: { latitude: bookingData.tripAddress[0].location.latitude, longitude: bookingData.tripAddress[0].location.longitude } }], 50000, [false], 0, rejectedDriver);
                for (const singleDriver of drivers) {
                    sendToDriverPushNotification(singleDriver._id, {
                        data: {
                            notificationType: 'jobInMatch'
                        }
                    })
                    // sendSocket(singleDriver?.driver?._id?.toString(), "jobInMatch", {})
                    sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                        event: "jobInMatch",
                        data: {}
                    })
                }
                await deleteMatchNotification("*", bookingData?._id?.toString())

                if (bookingData?.carPoolDetails?.isBookingUnderPool) {
                    await driversModel.updateOne(
                        { _id: request?.user?._id },
                        {
                            isDriverUnderPool: true
                        }
                    )

                    let isDriverUnderPool = await rideBookingsModel.findOne({
                        paymentStatus: true,
                        tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                        "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                        "carPoolDetails.bookingPoolDetails.endTime": null,
                        driver: request?.user?._id,
                    }).lean()
                    if (isDriverUnderPool) {
                        await rideBookingsModel.updateOne({ _id: params.id }, {
                            $set: {
                                "carPoolDetails.bookingPoolDetails": {
                                    poolId: isDriverUnderPool?.carPoolDetails?.bookingPoolDetails?.poolId,
                                }
                            },
                        })
                        await rideBookingsModel.updateOne({ _id: isDriverUnderPool._id }, {
                            $addToSet: { "carPoolDetails.bookingPoolDetails.bookingIds": params.id },
                            $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": bookingData?.switchRider?.passenger }
                        })
                        // sendSocket(request?.user?._id?.toString(), "poolUpdated", { poolId: isDriverUnderPool?.carPoolDetails?.bookingPoolDetails?.poolId });
                        sendToUserSocket(request?.user?._id?.toString(), {
                            event: "poolUpdated",
                            data: { poolId: isDriverUnderPool?.carPoolDetails?.bookingPoolDetails?.poolId }
                        })
                    } else {
                        await rideBookingsModel.updateOne({ _id: params.id }, {
                            $set: {
                                "carPoolDetails.bookingPoolDetails": {
                                    poolId: generatePoolId(),
                                    bookingIds: [params.id],
                                    maxCapacity: 4,
                                    currentPassengers: bookingData?.switchRider?.passenger,
                                    startTime: new Date(),
                                    endTime: null
                                }
                            },
                        })
                    }
                }

                sendToAllUsers("DriverLocationUpdate", {
                    driverId: request?.user?._id,
                    location: {
                        type: "Point",
                        coordinates: [
                            request?.user?.location?.coordinates[0] || 0,
                            request?.user?.location?.coordinates[1] || 0,
                        ],
                    },
                    heading: request?.user?.heading,
                })

                surgeUpdated()
                surgeCompleteProcessForSingleZone(bookingData?.tripAddress[0].location.latitude, bookingData?.tripAddress[0].location.longitude)
                // sendSocket(bookingData?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id })
                sendToUserSocket(bookingData?.customer?._id?.toString(), {
                    event: "singlebookingStatusUpdated",
                    data: { bookingId: params.id }
                })
                const checkedBusyDriverDroppedLoc = await rideBookingsModel.findOne({ driver: request?.user?._id, tripStatus: bookingStatus.picked, paymentStatus: true }).lean()
                if (checkedBusyDriverDroppedLoc) {
                    let { DistancekmCheck, DurationMinCheck } = await getDistanceTime(checkedBusyDriverDroppedLoc?.tripAddress, bookingData?.tripAddress);
                    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(request?.user?._id, checkedBusyDriverDroppedLoc?.tripAddress, true);
                    const sumOfDistance = DistancekmCheck + Distancekm;
                    await rideBookingsModel.updateOne({ _id: bookingData._id }, { matchJobDistance: sumOfDistance });
                }

                sendToDriverPushNotification(request?.user?._id, {
                    notification: {
                        title: "Assigned New Job",
                        body: "You have been assigned new job",
                    },
                    data: {},
                });

                return {
                    success: true,
                    message: "Job successfully assigned",
                    data: bookingData,
                };
            } else {
                return error(400, { success: false, message: "Job has been matched with another driver", data: null })
            }
        } catch (e: any) {
            logger.error({ error: e, msg: e.message });
            return error(400, { success: false, message: "Job assigning failed", data: null })
        }
    }
};

export const startScheduleBooking = async ({ request, body, params, error }: any) => {
    try {
        let bookingData: any = await rideBookingsModel
            .findOne({ _id: params.id })
            .populate("driver vehicleType customer")
            .lean();

        if (bookingData && bookingData?.tripStatus?.toLowerCase() == bookingStatus.ontheway) {
            await rideBookingsModel.updateOne(
                { _id: params.id },
                {
                    driver: request?.user?._id,
                    tripStatus: bookingStatus.ontheway,
                    "scheduled.startRide": true,
                }
            )
            if (jobSendByRedis) {
                await updateBookingInRedis(params.id, {
                    driver: request?.user,
                    tripStatus: bookingStatus.ontheway,
                    "scheduled.startRide": true,
                })
            }
            await driversModel.updateOne(
                { _id: request?.user?._id },
                {
                    iAmBusy: true,
                    missedBookingCount: 0,
                    missedBookingAt: null,
                    iAmOnline: true,
                }
            )

            if (bookingData?.customer?._id && !bookingData?.scheduled.startRide) {
                // sendSocket([bookingData?.driver?._id?.toString(), bookingData?.customer?._id?.toString()], "singlebookingStatusUpdated", { bookingId: params.id });
                sendToDriverSocket(bookingData?.driver?._id?.toString(), {
                    event: "singlebookingStatusUpdated",
                    data: { bookingId: params.id }
                })
                sendToUserSocket(bookingData?.customer?._id?.toString(), {
                    event: "singlebookingStatusUpdated",
                    data: { bookingId: params.id }
                })
                sendToCustomerPushNotification(
                    String(bookingData?.customer?._id),
                    {
                        notification: {
                            title: `Driver started your ride`,
                            body: "Your Drive is on the way",
                        },
                        data: {
                            notificationType: "bookingPlaces",
                            bookingId: bookingData._id,
                        },
                    }
                );
            }
            bookingData = await rideBookingsModel
                .findOne({ _id: params.id })
                .populate("driver vehicleType customer")
                .lean();
            return {
                success: true,
                message: "Job successfully assigned",
                data: bookingData,
            };
        } else {
            return error(400, { success: false, message: "Job already started", data: null })
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: "Job already started", data: null })
    }
}

export const bookingDetails = async ({ request, body, params, query, error }: any) => {
    try {
        let item = null;
        if (typeof query.populate != "undefined") {
            if (jobSendByRedis) {
                item = await getBookingFromRedis(params.id)
                if (item?.driver?._id && String(item?.driver?._id) !== String(request?.user?._id)) {
                    return error(405, { success: false, message: "Booking details not found for driver" })
                }
            }
            if (!item) {
                item = await rideBookingsModel.findById(params.id).populate(query.populate).lean();
                if (item?.driver?._id && String(item?.driver?._id) !== String(request?.user?._id)) {
                    return error(405, { success: false, message: "Booking details not found for driver" })
                }
            }
        } else {
            if (jobSendByRedis) {
                item = await getBookingFromRedis(params.id)
                if (item?.driver?._id && String(item?.driver?._id) !== String(request?.user?._id)) {
                    return error(405, { success: false, message: "Booking details not found for driver" })
                }
            }
            if (!item) {
                item = await rideBookingsModel.findById(params.id).lean();
                if (item?.driver && String(item?.driver) !== String(request?.user?._id)) {
                    return error(405, { success: false, message: "Booking details not found for driver" })
                }
            }
        }

        if (!item) {
            return error(400, {
                message: `No item found for id ${params.id}`,
                statusCode: 404,
            })
        }

        let multiPoolBookingDetails = []
        if (item?.carPoolDetails?.isBookingUnderPool) {
            let allPoolBookings = await rideBookingsModel.find({
                tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                "carPoolDetails.bookingPoolDetails.poolId": item?.carPoolDetails?.bookingPoolDetails?.poolId,
                paymentStatus: true,
            }).lean()
            if (allPoolBookings?.length > 0) {
                for (const singlePoolBooking of allPoolBookings) {
                    let newItem = null
                    if (typeof query.populate != 'undefined') {
                        newItem = await rideBookingsModel.findById(singlePoolBooking._id).populate(query?.populate).lean()
                    } else {
                        newItem = await rideBookingsModel.findById(singlePoolBooking._id).lean()
                    }
                    let callDetailsToken = setUpForVoiceCall(0, singlePoolBooking._id);
                    newItem = { ...newItem, callDetailsToken }
                    multiPoolBookingDetails.push(newItem)
                }
            }
        }

        let activeBookingCount;
        if (jobSendByRedis) {
            activeBookingCount = await getActiveBookingCountFromRedis(request?.user?._id)
        } else {
            activeBookingCount = await rideBookingsModel.countDocuments({
                driver: request?.user?._id,
                paymentStatus: true,
                tripStatus: { $in: [bookingStatus.picked, bookingStatus.arrived, bookingStatus.ontheway] },
                $or: [
                    { "scheduled.scheduledAt": null },
                    {
                        $and: [
                            { "scheduled.scheduledAt": { $ne: null } },
                            { "scheduled.startRide": true }
                        ],
                    },
                ],
            });
        }
        let secondActiveBookingDetails;

        if (jobSendByRedis) {
            secondActiveBookingDetails = await getSecondActiveBookingFromRedis(request?.user?._id, params.id)
        } else {
            secondActiveBookingDetails = await rideBookingsModel.findOne({
                driver: request?.user?._id,
                _id: { $ne: params.id },
                paymentStatus: true,
                tripStatus: { $in: [bookingStatus.picked, bookingStatus.arrived, bookingStatus.ontheway] },
                $or: [
                    { "scheduled.scheduledAt": null },
                    {
                        $and: [
                            { "scheduled.scheduledAt": { $ne: null } },
                            { "scheduled.startRide": true }
                        ],
                    },
                ],
            });
        }

        const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
            request?.user?._id,
            item.tripAddress
        );

        let callDetailsToken = setUpForVoiceCall(0, params.id);
        let customerLiveLoc = item?.shareLocWithDriver ? await getUserLocFromRedis(item?.customer?._id ? item?.customer?._id : item?.customer) : null

        item = {
            ...item,
            activeBookingCount,
            secondActiveBookingDetails,
            Distancekm,
            DurationMin,
            callDetailsToken,
            multiPoolBookingDetails,
            customerLiveLoc
        };

        return { success: true, data: item };
    } catch (e: any) {
        // console.log("eeeee", e)
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
};

export const bookingChat = async ({ request, body, query, params, response, error }: any) => {
    try {
        return { success: true, data: { chat: await bookingChatModel.find({ chat: params.id }).lean() } };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
            success: false,
            data: {
                chat: [],
            }
        })
    }
};

export const cancelledByDriverBooking = async ({ request, body, query, params, response, error }: any) => {
    try {
        let order: any = null;
        if (jobSendByRedis) {
            order = await getBookingFromRedis(params.id);
        } else {
            order = await rideBookingsModel.findById(params.id).populate("customer").lean();
        }

        if (!order) {
            return error(400, { success: false, message: "Booking not available" })
        }
        if (order.tripStatus.toLowerCase() == bookingStatus?.canceled) {
            return error(400, { success: false, message: `Booking already cancelled.` })
        }
        let updateData: any = {};

        if (order.tripStatus.toLowerCase() == bookingStatus.ontheway) {
            if (order?.driver && String(order?.driver?._id || order?.driver) !== String(request?.user?._id)) {
                return error(400, { success: false, message: "Booking not found for driver cancellation" })
            }
            
            updateData = {
                driver: null,
                tripStatus: bookingStatus.finding_driver,
                $push: {
                    rejectedDriver: request?.user?._id,
                    cancelledByDriver: {
                        canceledByDriver: request?.user?._id,
                        driverCanceledReason: body?.reson || "",
                        acceptedAt: order?.acceptedAt || null,
                        arrivedAt: order?.arrivedAt || null,
                        canceledAt: new Date(),
                    },
                },
                askDriver: {
                    driver: null,
                    expTime: null,
                },
                "scheduled.startRide": false,
                "carPoolDetails.bookingPoolDetails": null,
                canceledByDriver: "Driver",
                driverCanceledReason: body?.reson || "",
                acceptedAt: null,
                arrivedAt: null
            }
            await updateBookingInRedis(params.id, updateData);
            await renameKeyInRedis(`booking:${params.id}-${String(order?.customer?._id)}-${String(order?.driver?._id || order?.driver)}`, `booking:${params.id}-${String(order?.customer?._id)}-*`);
            await deleteMatchNotification(request?.user?._id?.toString(), order?._id?.toString())
            rideBookingsModel.updateOne({ _id: params.id }, updateData).exec();
            const isAnyOtherActiveBooking = await getActiveBookingFromRedis(request?.user?._id)
            // const isAnyOtherActiveBooking = await rideBookingsModel.findOne({
            //     $or: [
            //         { "scheduled.scheduledAt": null },
            //         {
            //             $and: [
            //                     { "scheduled.scheduledAt": { $ne: null } },
            //                     { "scheduled.startRide": true }
            //                 ],
            //             },
            //         ],
            //         driver: request?.user?._id,
            //         orderNo: { $ne: order.orderNo },
            //         tripStatus: { $in: [bookingStatus.picked, bookingStatus.ontheway, bookingStatus.arrived] },
            //         paymentStatus: true,
            //     });


            await driversModel.updateOne(
                { _id: request?.user?._id },
                { iAmBusy: !isAnyOtherActiveBooking ? false : true }
            );

            if (!order?.scheduled?.scheduledAt || (order.scheduled?.isScheduled && order.scheduled?.scheduledAt && (new Date(order.scheduled?.scheduledAt) < new Date(Date.now() + 10 * 60 * 1000)) && (new Date(order.scheduled?.scheduledAt) > new Date(Date.now() + 5 * 60 * 1000)))) {
                if (jobSendByRedis) {
                    findNearDriverFromRedis(order)
                    matchJobProcessStartFromRedis(order)
                } else {
                    findNearDriver(order);
                    matchJobProcessStart(order);
                }
                surgeUpdated()
                surgeCompleteProcessForSingleZone(order?.tripAddress[0]?.location?.latitude, order?.tripAddress[0]?.location?.longitude)
            }

            sendToCustomerPushNotification(order.customer, {
                notification: {
                    title: `Finding new driver for you.`,
                    body: "Last ride cancelled by driver. Don't worry we will assign new driver shortly.",
                },
                data: {
                    notificationType: bookingStatus.finding_driver,
                    bookingId: order._id,
                },
            });

            if (order?.scheduled?.isScheduled) {
                let drivers = await getNearByDrivers(
                    [
                        {
                            location: {
                                latitude: order.tripAddress[0].location.latitude,
                                longitude: order.tripAddress[0].location.longitude,
                            },
                        },
                    ],
                    30000,
                    [true, false]
                );
                for (const singleDriver of drivers) {
                    if (String(request?.user?._id) !== String(singleDriver._id)) {
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

            let rejectedDriver = order?.rejectedDriver || [];
            rejectedDriver = [
                ...new Set(rejectedDriver?.map((itm: any) => itm.toString())),
            ];

            let drivers = await getNearByDrivers([{ location: { latitude: order.tripAddress[0].location.latitude, longitude: order.tripAddress[0].location.longitude } }], 50000, [false], 0, rejectedDriver);
            for (const singleDriver of drivers) {
                sendToDriverPushNotification(singleDriver._id, {
                    data: {
                        notificationType: 'jobInMatch'
                    }
                })
                await deleteMatchNotification(singleDriver?.driver?._id?.toString(), order?._id?.toString())
                // sendSocket(singleDriver?.driver?._id?.toString(), "jobInMatch", {});
                sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                    event: "jobInMatch",
                    data: {}
                })
            }
            sendToAllUsers("DriverLocationUpdate", {
                driverId: request?.user?._id,
                location: {
                    type: "Point",
                    coordinates: [
                        request?.user?.location?.coordinates[0] || 0,
                        request?.user?.location?.coordinates[1] || 0,
                    ],
                },
                heading: request?.user?.heading,
            })
            // sendSocket(order?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id });
            sendToUserSocket(order?.customer?._id?.toString(), {
                event: "singlebookingStatusUpdated",
                data: { bookingId: params.id }
            })
            // if (order?.carPoolDetails?.isBookingUnderPool) {
            //     await rideBookingsModel.updateOne({ _id: params.id }, {
            //         $set: {
            //             "carPoolDetails.bookingPoolDetails": null
            //         },
            //     })

            //     await rideBookingsModel.updateOne(
            //         {
            //             "carPoolDetails.bookingPoolDetails.poolId": order?.carPoolDetails?.bookingPoolDetails?.poolId,
            //             "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
            //             paymentStatus: true,
            //         },
            //         {
            //             $pull: { "carPoolDetails.bookingPoolDetails.bookingIds": params.id },
            //             $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": -order?.switchRider?.passenger }
            //         }
            //     );

            //     let isDriverUnderPool = await rideBookingsModel.findOne({
            //         "carPoolDetails.isBookingUnderPool": true,
            //         tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
            //         paymentStatus: true,
            //         driver: request?.user?._id,
            //     }).lean()

            //     if (!isDriverUnderPool) {
            //         await driversModel.updateOne(
            //             { _id: request?.user?._id },
            //             {
            //                 isDriverUnderPool: false
            //             }
            //         )
            //         await driverDetailsSave(request?.user?._id, {
            //             isDriverUnderPool: false
            //         })
            //     }

            //     sendSocket(request?.user?.socket_id?.toString(), "poolUpdated", { poolId: order?.carPoolDetails?.bookingPoolDetails?.poolId });
            // }

            return { success: true, message: "Booking successfully cancelled." };
        } else if (order.tripStatus == bookingStatus.arrived) {
            if (order?.driver && String(order?.driver?._id || order?.driver) !== String(request?.user?._id)) {
                return error(400, { success: false, message: "Booking not found for driver cancellation" })
            }
            let jobData: any = {
                canceledBy: "driver",
                canceledReason: body?.reson || "",
                cancelledAt: new Date(),
                $push: {
                    rejectedDriver: request?.user?._id,
                    cancelledByDriver: {
                        canceledByDriver: request?.user?._id,
                        driverCanceledReason: body?.reson || "",
                        acceptedAt: order.acceptedAt,
                        arrivedAt: order.arrivedAt,
                        canceledAt: new Date(),
                    }
                },
            }
            if (new Date(Date.now() - cancellatinChargesApplyAfterJobCancelByDriver) > new Date(order.arrivedAt)) {
                jobData.tripStatus = bookingStatus.canceled;
            } else {
                jobData = {
                    ...jobData,
                    tripStatus: bookingStatus.finding_driver,
                    driver: null,
                    askDriver: {
                        driver: null,
                        expTime: null,
                    },
                    "scheduled.startRide": false,
                    "carPoolDetails.bookingPoolDetails": null,
                    acceptedAt: null,
                    arrivedAt: null
                }
            }

            if (jobSendByRedis) {
                await updateBookingInRedis(params.id, jobData);
                if (jobData.tripStatus === bookingStatus.finding_driver) {
                    await renameKeyInRedis(`booking:${params.id}-${String(order?.customer?._id)}-${String(order?.driver?._id || order?.driver)}`, `booking:${params.id}-${String(order?.customer?._id)}-*`);
                }
            } else {
                await rideBookingsModel.updateOne({ _id: params.id }, jobData);
            }
            await deleteMatchNotification(request?.user?._id?.toString(), order?._id?.toString())
            const isAnyOtherActiveBooking = await rideBookingsModel.findOne({
                $or: [
                    { "scheduled.scheduledAt": null },
                    {
                        $and: [
                            { "scheduled.scheduledAt": { $ne: null } },
                            { "scheduled.startRide": true }
                        ],
                    },
                ],
                driver: request?.user?._id,
                orderNo: { $ne: order.orderNo },
                tripStatus: { $in: [bookingStatus.picked, bookingStatus.ontheway, bookingStatus.arrived] },
                paymentStatus: true,
            });

            await driversModel.updateOne(
                { _id: request?.user?._id },
                { iAmBusy: !isAnyOtherActiveBooking ? false : true }
            );
            // sendSocket(order?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id });
            sendToUserSocket(order?.customer?._id?.toString(), {
                event: "singlebookingStatusUpdated",
                data: { bookingId: params.id }
            })
            if (order?.scheduled?.isScheduled) {
                let drivers = await getNearByDrivers(
                    [
                        {
                            location: {
                                latitude: order.tripAddress[0].location.latitude,
                                longitude: order.tripAddress[0].location.longitude,
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
                    // sendSocket(singleDriver?.driver?._id?.toString(), "jobInSchdule", {});
                    sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                        event: "jobInSchdule",
                        data: {}
                    })
                }
            }
            let collectRejectedDrivers: any = order?.rejectedDriver || [];
            collectRejectedDrivers.push(request?.user?._id)
            let drivers = await getNearByDrivers(
                [{ location: { latitude: order.tripAddress[0].location.latitude, longitude: order.tripAddress[0].location.longitude } }],
                50000, [false], 0, collectRejectedDrivers);

            for (const singleDriver of drivers) {
                sendToDriverPushNotification(singleDriver._id, {
                    data: {
                        notificationType: 'jobInMatch'
                    }
                })
                // sendSocket(singleDriver?.driver?._id?.toString(), "jobInMatch", {});
                sendToDriverSocket(singleDriver?.driver?._id?.toString(), {
                    event: "jobInMatch",
                    data: {}
                })
            }

            sendToAllUsers("DriverLocationUpdate", {
                driverId: order?.driver?._id || order?.driver,
                location: {
                    type: "Point",
                    coordinates: [
                        order?.driver?.location?.coordinates[0] || 0,
                        order?.driver?.location?.coordinates[1] || 0,
                    ],
                },
                heading: order?.driver?.heading,
            })

            surgeUpdated();
            surgeCompleteProcessForSingleZone(
                order?.tripAddress[0]?.location?.latitude,
                order?.tripAddress[0]?.location?.longitude
            );

            // if (order?.carPoolDetails?.isBookingUnderPool) {
            //     await rideBookingsModel.updateOne(
            //         {
            //             "carPoolDetails.bookingPoolDetails.poolId": order?.carPoolDetails?.bookingPoolDetails?.poolId,
            //             "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
            //             paymentStatus: true,
            //         },
            //         {
            //             $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": -order?.switchRider?.passenger }
            //         }
            //     );

            //     let isDriverUnderPool = await rideBookingsModel.findOne({
            //         "carPoolDetails.isBookingUnderPool": true,
            //         tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
            //         paymentStatus: true,
            //         driver: order?.driver,
            //     }).lean()

            //     if (!isDriverUnderPool) {
            //         await driversModel.updateOne(
            //             { _id: order?.driver },
            //             {
            //                 isDriverUnderPool: false
            //             }
            //         )
            //     }
            //     sendSocket(request?.user?._id?.toString(), "poolUpdated", { poolId: order?.carPoolDetails?.bookingPoolDetails?.poolId });
            //     sendSocket(order.driver?._id?.toString(), "poolUpdated", { poolId: order?.carPoolDetails?.bookingPoolDetails?.poolId });
            // }

            if ((new Date(Date.now() - cancellatinChargesApplyAfterJobCancelByDriver) > new Date(order.arrivedAt) && !order?.scheduled?.isScheduled) || (new Date(Date.now() - cancellatinChargesApplyAfterJobCancelByDriver) > new Date(order.scheduled.scheduledAt) && order?.scheduled?.isScheduled)) {
                let cancellationChargesObj = {
                    description: "Cancellation Charges",
                    charges: 6.09,
                    tax: .91,
                    total: 7.00
                };
                let driverEarningChargesObj = {
                    description: "Driver Earning",
                    charges: 4.5,
                    tax: 4.5 * .15,
                    total: 5.175
                };

                if (order.paymentMethodId == "wallet") {
                    await usersModel.updateOne({ _id: order.customer }, { $inc: { wallet: -cancellationChargesObj.total || 0 } })
                    await userWalletTransactionsModel.create({
                        amount: -cancellationChargesObj.total || 0,
                        description: "cancellation of booking",
                        trxType: "Debit",
                        trxId: `WLT${generateRandomNumbers(6)}`,
                        user: order.customer,
                    });
                    await activityLogsModel.create({
                        title: "Removed money in wallet by user",
                        description: "cancellation of booking",
                        user: order.customer,
                    });
                } else {
                    if (order?.paymentIntentId?.includes("pi_")) {
                        await capturePaymentIntent(order?.paymentIntentId || "", cancellationChargesObj.total * 100);
                    } else if (order?.paymentIntentId) {
                        await squareCompletePayment(order?.paymentIntentId || "", cancellationChargesObj.total * 100);
                    }
                }

                await rideBookingsModel.updateOne({ _id: order?._id }, {
                    "finalBilling.userBilling.cancellationCharges": cancellationChargesObj.charges,
                    "finalBilling.userBilling.tax.taxTotal": cancellationChargesObj.tax,
                    "finalBilling.userBilling.totalAmount": cancellationChargesObj.total,
                    "finalBilling.driverEarning.cancellationPrice": driverEarningChargesObj.charges,
                    "finalBilling.driverEarning.driverTax": driverEarningChargesObj.tax,
                    "finalBilling.driverEarning.grandTotal": driverEarningChargesObj.total
                })

                await driversModel.updateOne(
                    { _id: order.driver },
                    { $inc: { wallet: driverEarningChargesObj.total } }
                );

                await driversWalletTransactionModel.create({
                    description: "On ride cancellation",
                    amount: driverEarningChargesObj.total,
                    trxType: "Credit",
                    driver: order.driver,
                    bookingId: order._id,
                });
            }
            return { success: true, message: "Booking successfully cancelled." };
        }
        return error(400, {
            success: false,
            message: "Booking cannot cancelled. Please contact our support.",
        })
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: "Something is wrong" })
    }
};

export const updateBookingStatus = async ({ request, body, query, params, response, error }: any) => {
    if (jobSendByRedis) {
        try {
            let booking: any = await getBookingFromRedis(body._id);
            if (!booking) {
                return error(404, { success: false, message: "Booking not found for status update" })
            }
              
            let pushData = {};
            if (![bookingStatus.canceled, bookingStatus.completed].includes(booking?.tripStatus?.toLowerCase())) {

                if (booking?.driver && String(booking?.driver?._id) !== String(request?.user?._id)) {
                    return error(400, { success: false, message: "Booking not found for driver change status" })
                }

                if (body.status == bookingStatus.picked) {
                    if (body.otp != booking.otp) {
                        return error(400, { success: false, message: "OTP is wrong" })
                    }
                }

                if (body.status == bookingStatus.arrived) {
                    if (booking.tripStatus !== bookingStatus.ontheway) {
                        return error(400, { success: false, message: "Wrong Trip Status" })
                    }
                    await updateBookingInRedis(body._id, {
                        tripStatus: bookingStatus.arrived,
                        isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                        arrivedAt: new Date().toISOString(),
                    })
                    if (typeof booking?.driver?._id !== "undefined") await driversModel.updateOne(
                        { _id: booking.driver?._id },
                        {
                            iAmBusy: true,
                        }
                    );

                    let driverDetails: any = booking.driver

                    const colorToImageMap: any = {
                        '#334155': "Blue Car",
                        '#fff': "White Car",
                        '#808080': "Gray Car",
                        '#f1f5f9': "Light Grayish Blue Car",
                        '#ef4444': "Red Car",
                        '#3b82f6': "Blue Car",
                        '#A52A2A': "Brown Car",
                        '#22c55e': "Green Car",
                        '#eab308': "Yellow Car",
                        '#f59e0b': "Orange Car",
                        '#C0C0C0': "Silver Car",
                        '#000000': "Black Car",
                        '#8B0000': "Dark Red Car",
                        '#00008B': "Dark Blue Car",
                        '#008000': "Green Car",
                        '#FFFF00': "Yellow Car",
                        '#FFA500': "Orange Car",
                        '#FFD700': "Gold Car",
                        '#800080': "Purple Car",
                        '#FFC0CB': "Pink Car"
                    };

                    const color: any = driverDetails?.vehicleInfo?.chooseColor;
                    const vehicleImageSource = colorToImageMap[color]

                    pushData = {
                        notification: {
                            title: `Your ride is here!`,
                            body: `Driver is wating. Look for the car with plate (${driverDetails?.vehicleInfo?.vehicleNo}) - it's a ${vehicleImageSource} ${driverDetails?.vehicleInfo?.vehicleMake} ${driverDetails?.vehicleInfo?.vehicleModel}. Make sure the driver's face matches the photo.`,
                        },
                        data: {
                            notificationType: "bookingStatus",
                            tripStatus: bookingStatus.arrived,
                            bookingId: booking._id,
                        },
                        sound: "car_horn.mp3",
                    };
                } else if (body.status == bookingStatus.picked) {
                    if (!body?.otp || body?.otp?.length == 0) {
                        return error(400, { success: false, message: "Enter valid OTP" })
                    } else if (body?.otp != booking.otp) {
                        return error(400, { success: false, message: "OTP is wrong" })
                    }
                    if (booking.tripStatus !== bookingStatus.arrived) {
                        return error(400, { success: false, message: "Wrong Trip Status" })
                    }

                    let maxReachingSeconds = 0;
                    const response = await getDirections(booking?.tripAddress);
                    if (response) {
                        maxReachingSeconds = Number.parseInt(
                            response[0].legs[0]?.duration?.value
                        );
                    }
                    await updateBookingInRedis(body._id, {
                        tripStatus: bookingStatus.picked,
                        pickedAt: new Date(),
                        maxReachingSeconds,
                    });
                    await driversModel.updateOne(
                        { _id: booking.driver?._id },
                        {
                            iAmBusy: true,
                        }
                    )

                    pushData = {
                        notification: {
                            title: `Your ride is started.`,
                            body: "Enjoy your ride.",
                        },
                        data: {
                            notificationType: "bookingStatus",
                            tripStatus: bookingStatus.picked,
                            bookingId: booking._id,
                        },
                    };
                } else if (body.status == bookingStatus.completed) {
                    if (booking.tripStatus !== bookingStatus.picked) {
                        return error(400, { success: false, message: "Wrong Trip Status" })
                    }

                    const arrivingTime = new Date(booking?.arrivedAt).getTime();
                    const pickupTime = new Date(booking?.pickedAt).getTime();
                    let differenceInMilliseconds: any = pickupTime - arrivingTime;
                    let differenceInSeconds = Math.floor(
                        differenceInMilliseconds / 1000
                    );
                    let waitingChargesObj = {
                        description: "Waiting Charges",
                        charges: 0,
                    };

                    let stopPointTimerWaiting = []
                    if (booking?.wayPointsTripStatus?.length > 0) {
                        for (const element of booking.wayPointsTripStatus) {
                            if (element?.tripStatus === bookingStatus.picked && element?.arrivedAt && element?.pickedAt) {
                                const arrivingTime = new Date(element?.arrivedAt).getTime();
                                const pickupTime = new Date(element?.pickedAt).getTime();
                                 differenceInMilliseconds = pickupTime - arrivingTime;
                                 differenceInSeconds = Math.floor(
                                    differenceInMilliseconds / 1000
                                );
                                stopPointTimerWaiting.push(differenceInSeconds)
                            }
                        }
                    }

                    if (differenceInSeconds > 150) {
                        waitingChargesObj.charges = Number(Number(((differenceInSeconds - 120) * (waitingChargeRate / 60)).toFixed(2)));
                    }

                    let sum = stopPointTimerWaiting?.reduce((acc, num) => acc + num, 0);
                    let lengthOfStopPointTimerWaiting = stopPointTimerWaiting.length;
                    if (sum > (150 * lengthOfStopPointTimerWaiting)) {
                        waitingChargesObj.charges = waitingChargesObj.charges + Number(Number(((sum - (120 * lengthOfStopPointTimerWaiting)) * (waitingChargeRate / 60)).toFixed(2)))
                    }

                    if (booking?.scheduled?.scheduledAt) {
                        const scheduledTime = new Date(booking.scheduled.scheduledAt).getTime();
                        if ((arrivingTime <= scheduledTime) && (scheduledTime <= pickupTime)) {
                             differenceInMilliseconds = pickupTime - scheduledTime;
                         differenceInSeconds = Math.floor(differenceInMilliseconds / 1000);
                            
                            if (differenceInSeconds > 150) {
                                waitingChargesObj.charges = Number(Number(((differenceInSeconds - 120) * (waitingChargeRate / 60)).toFixed(2)));
                            } else {
                                waitingChargesObj.charges = 0
                            }
                        }
                        // else if(arrivingTime > scheduledTime)
                        
                        else if (arrivingTime > scheduledTime) {
                       

                            differenceInMilliseconds = pickupTime - arrivingTime;
                            differenceInSeconds = Math.floor(differenceInMilliseconds / 1000);
                        

                            if (differenceInSeconds > 150) {
                                waitingChargesObj.charges = Number(Number(((differenceInSeconds - 120) * (waitingChargeRate / 60)).toFixed(2)));
                            } else {
                                waitingChargesObj.charges = 0
                            }
                        } else {
                            waitingChargesObj.charges = 0
                        }
                    }

                    if (booking?.isForce || body?.isForce) {
                        waitingChargesObj.charges = 0
                    }

                    // if (booking?.carPoolDetails?.isBookingUnderPool) {
                    //     let isDriverUnderPool = await rideBookingsModel.findOne({
                    //         "carPoolDetails.bookingPoolDetails.poolId": booking?.carPoolDetails?.bookingPoolDetails?.poolId,
                    //         tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                    //         paymentStatus: true,
                    //         driver: booking.driver,
                    //     }).lean()
                    //     if (!isDriverUnderPool) {
                    //         await driversModel
                    //             .updateOne(
                    //                 { _id: booking.driver },
                    //                 {
                    //                     isDriverUnderPool: false
                    //                 }
                    //             )
                    //         await rideBookingsModel.updateOne(
                    //             {
                    //                 "carPoolDetails.bookingPoolDetails.poolId": booking?.carPoolDetails?.bookingPoolDetails?.poolId,
                    //                 "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                    //                 "carPoolDetails.bookingPoolDetails.endTime": null,
                    //                 paymentStatus: true,
                    //             },
                    //             {
                    //                 "carPoolDetails.bookingPoolDetails.endTime": new Date(),
                    //             }
                    //         );
                    //     } else {
                    //         await rideBookingsModel.updateOne(
                    //             {
                    //                 "carPoolDetails.bookingPoolDetails.poolId": booking?.carPoolDetails?.bookingPoolDetails?.poolId,
                    //                 "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                    //                 "carPoolDetails.bookingPoolDetails.endTime": null,
                    //                 paymentStatus: true,
                    //             },
                    //             {
                    //                 $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": -booking?.switchRider?.passenger }
                    //             }
                    //         );
                    //     }
                    // }

                    let capturableAmount = Number(
                        Number(
                            booking?.finalBilling?.userBilling?.totalAmount + waitingChargesObj?.charges
                        ).toFixed(2)
                    );

                    let driverEarningIncrement = booking?.finalBilling?.driverEarning?.grandTotal;
                    driverEarningIncrement = await placeDriverBilling(body, waitingChargesObj);

                    if (booking.paymentMethodId == "wallet") {
                        await usersModel.updateOne({ _id: booking.customer }, { $inc: { wallet: -capturableAmount || 0 }, })
                        await userWalletTransactionsModel.create({
                            amount: -capturableAmount || 0,
                            description: "completion of booking",
                            trxType: "Debit",
                            trxId: `WLT${generateRandomNumbers(6)}`,
                            user: booking.customer,
                        });
                        await activityLogsModel.create({
                            title: "Removed money in wallet by user",
                            description: "completion of booking",
                            user: booking.customer,
                        });
                    } else {
                        if (booking?.paymentIntentId?.includes("pi_")) {
                            let paymnetIntentResultData: any = await getPaymentIntentRetrievalResult(booking.paymentIntentId);
                            await capturePaymentIntent(booking?.paymentIntentId || "");
                            if (paymnetIntentResultData && ((capturableAmount * 100) - paymnetIntentResultData.amount_capturable) > 60) {
                                // await autoDeductExtraChargesFromCustomer(booking, Number.parseInt(String((capturableAmount * 100) - paymnetIntentResultData.amount_capturable)));

                                let waitingChargesIntent = await autoDeductExtraChargesFromCustomer(booking, Number.parseInt(String((capturableAmount * 100) - paymnetIntentResultData.amount_capturable)));
                                if (waitingChargesIntent) {
                                    await updateBookingWithKeyRename(body._id, {
                                        waitingChargesIntent: waitingChargesIntent.id,
                                    })
                                }
                            }
                        } else {
                            await squareCompletePayment(booking?.paymentIntentId || "");
                            let paymnetIntentResultData: any = await squarePaymentStatus(booking?.paymentIntentId);
                            let customerDetails = await usersModel.findOne({ _id: booking.customer });
                            // if (paymnetIntentResultData && ((capturableAmount * 100) - Number(paymnetIntentResultData?.payment?.amountMoney?.amount)) > 60) {
                            //     await createSquarePayment(request, Number.parseInt(String((capturableAmount * 100) - Number(paymnetIntentResultData.payment.amountMoney?.amount))), booking.paymentMethodId, "Other Charges Deduction", booking._id, true, customerDetails?.extraFields, customerDetails?._id)
                            // }
                            if (paymnetIntentResultData && ((capturableAmount * 100) - Number(paymnetIntentResultData?.payment?.amountMoney?.amount)) > 30) {
                                let waitingChargesIntent = await createSquarePayment(request, Number.parseInt(String((capturableAmount * 100) - Number(paymnetIntentResultData.payment.amountMoney?.amount))), booking.paymentMethodId, "Other Charges Deduction", booking._id, true, customerDetails?.extraFields, customerDetails?._id)
                                if (waitingChargesIntent) {
                                    await updateBookingWithKeyRename(body._id, {
                                        waitingChargesIntent: waitingChargesIntent.payment.id,
                                    })
                                }
                            }
                        }
                    }

                    await updateBookingInRedis(body._id, {
                        tripStatus: bookingStatus.completed,
                        isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                        dropedAt: new Date(),
                        $push: { "finalBilling.userBilling.extraCharges": waitingChargesObj },
                        waitingTime: [differenceInSeconds, ...stopPointTimerWaiting],
                    })

                    let isAnyOtherActiveBooking: any = await getActiveBookingFromRedis(booking?.driver._id)

                    isAnyOtherActiveBooking = isAnyOtherActiveBooking && isAnyOtherActiveBooking.orderNo != booking?.orderNo
                    let updatedDriverData: any = {}

                    if (!isAnyOtherActiveBooking) {
                        updatedDriverData = {
                            $inc: { wallet: driverEarningIncrement || 0 }, iAmBusy: false
                        }
                        sendToAllUsers("DriverLocationUpdate", {
                            driverId: booking?.driver._id,
                            location: {
                                type: "Point",
                                coordinates: [
                                    request?.user?.location?.coordinates[0] || 0,
                                    request?.user?.location?.coordinates[1] || 0,
                                ],
                            },
                            heading: request?.user?.heading,
                        })
                    } else {
                        updatedDriverData = {
                            $inc: { wallet: driverEarningIncrement || 0 }, iAmBusy: true
                        }
                        // sendSocket(isAnyOtherActiveBooking?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: isAnyOtherActiveBooking._id });
                        sendToUserSocket(isAnyOtherActiveBooking?.customer?._id?.toString(), {
                            event: "singlebookingStatusUpdated",
                            data: { bookingId: isAnyOtherActiveBooking._id }
                        })
                    }

                    await driversModel.updateOne({ _id: booking.driver, stopFutureRide: true }, {
                        iAmOnline: false,
                        stopFutureRide: false,
                        socket_id: "",
                        missedBookingCount: 0,
                        missedBookingAt: null,
                    });

                    const existingTxn = await driversWalletTransactionModel.findOne({
                        description: "On ride completion",
                        bookingId: booking?._id,
                        driver: booking?.driver,
                    });

                    if (!existingTxn) {
                        await driversWalletTransactionModel.create({
                            description: "On ride completion",
                            amount: driverEarningIncrement || 0,
                            trxType: "Credit",
                            driver: booking?.driver,
                            bookingId: booking?._id,
                        });
                        await driversModel.updateOne(
                            { _id: booking.driver },
                            { ...updatedDriverData }
                        );
                    }

                    pushData = {
                        notification: {
                            title: `Your ride is completed.`,
                            body: "Enjoy your day.",
                        },
                        data: {
                            notificationType: "bookingStatus",
                            tripStatus: bookingStatus.completed,
                            bookingId: booking._id,
                        },
                    };

                    let userDetails = await usersModel.findOne({ _id: booking.customer }, { rideCount: 1 })
                    let countRides = userDetails?.rideCount
                    if (booking.coupon) {
                        await couponsModel.updateOne(
                            {
                                _id: booking.coupon,
                                autoApply: true,
                                status: true,
                                validFor: "newUsers",
                                userId: booking.customer,
                                usageLimit: { $gte: 1 },
                            },
                            { $inc: { usedCount: 1 } }
                        );
                    }
                    if (countRides === 1) {
                        let userData = await usersModel.findOne({
                            _id: booking.customer,
                            inviteBy: { $ne: null },
                        });
                        let couponDetails = await couponsModel.findOne({ invitedBy: userData?.inviteBy, invitedTo: booking?.customer }).lean()
                        if (userData && userData?.inviteBy && couponDetails) {
                            await couponsModel.create({
                                code: `${generateInviteCode(6)}${couponDetails.discountAmount}`,
                                discountType: "percentage",
                                discountAmount: couponDetails.discountAmount,
                                uptoAmount: 100,
                                expiredAt: new Date(
                                    new Date().getTime() + 30 * 24 * 60 * 60 * 1000
                                ),
                                usageLimit: 5,
                                usedCount: 0,
                                userId: userData.inviteBy,
                                autoApply: true,
                                validFor: "newUsers",
                                invitedBy: userData.inviteBy,
                                status: true,
                                invitedTo: booking.customer,
                            });
                        }
                    }
                }

                sendToCustomerPushNotification(
                    booking.customer,
                    pushData
                );
                let newBookingData = await getBookingFromRedis(body._id);

                // sendSocket(newBookingData?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: body._id });
                sendToUserSocket(newBookingData?.customer?._id?.toString(), {
                    event: "singlebookingStatusUpdated",
                    data: { bookingId: body._id }
                })
                return {
                    success: true,
                    message: "Booking status changed.",
                    data: newBookingData,
                };
            } else {
                return error(400, { success: false, message: "Booking already finished" })
            }

        } catch (e: any) {
            logger.error({ error: e, msg: e.message });
            return error(400, { success: false, message: "Booking update error" })
        }
    } 
    else {

        try {

            let booking: any = await rideBookingsModel.findById(body._id).lean();

            if (!booking) {
                return error(400, { success: false, message: "Booking not found for status update" })
            }

            if (booking) {
                let pushData = {};
                if (
                    ![bookingStatus.canceled, bookingStatus.completed].includes(booking?.tripStatus?.toLowerCase())
                ) {
                    if (booking?.driver && String(booking?.driver) !== String(request?.user?._id)) {
                        return error(400, { success: false, message: "Booking not found for driver change status" })
                    }

                    if (body.status == bookingStatus.picked) {
                        if (body.otp != booking.otp) {
                            return error(400, { success: false, message: "OTP is wrong" })
                        }
                    }

                    if (body.status == bookingStatus.arrived) {
                        if (booking.tripStatus !== bookingStatus.ontheway) {
                            return error(400, { success: false, message: "Wrong Trip Status" })
                        }
                        await rideBookingsModel.updateOne(
                            { _id: body._id },
                            {
                                tripStatus: bookingStatus.arrived,
                                isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                                arrivedAt: moment(body?.arrivedAt).format("YYYY-MM-DD HH:mm:ss"),
                            }
                        );
                        await driversModel.updateOne(
                            { _id: booking.driver },
                            {
                                iAmBusy: true,
                            }
                        );

                        let driverDetails: any = await driversModel.findOne({ _id: booking.driver }).lean();

                        const colorToImageMap: any = {
                            '#334155': "Blue Car",
                            '#fff': "White Car",
                            '#808080': "Gray Car",
                            '#f1f5f9': "Light Grayish Blue Car",
                            '#ef4444': "Red Car",
                            '#3b82f6': "Blue Car",
                            '#A52A2A': "Brown Car",
                            '#22c55e': "Green Car",
                            '#eab308': "Yellow Car",
                            '#f59e0b': "Orange Car",
                            '#C0C0C0': "Silver Car",
                            '#000000': "Black Car",
                            '#8B0000': "Dark Red Car",
                            '#00008B': "Dark Blue Car",
                            '#008000': "Green Car",
                            '#FFFF00': "Yellow Car",
                            '#FFA500': "Orange Car",
                            '#FFD700': "Gold Car",
                            '#800080': "Purple Car",
                            '#FFC0CB': "Pink Car"
                        };

                        const color: any = driverDetails?.vehicleInfo?.chooseColor;
                        const vehicleImageSource = colorToImageMap[color]

                        pushData = {
                            notification: {
                                title: `Your ride is here!`,
                                body: `Driver is wating. Look for the car with plate (${driverDetails?.vehicleInfo?.vehicleNo}) - it's a ${vehicleImageSource} ${driverDetails?.vehicleInfo?.vehicleMake} ${driverDetails?.vehicleInfo?.vehicleModel}. Make sure the driver's face matches the photo.`,
                            },
                            data: {
                                notificationType: "bookingStatus",
                                tripStatus: bookingStatus.arrived,
                                bookingId: booking._id,
                            },
                            sound: "car_horn.mp3",
                        };
                    } else if (body.status == bookingStatus.picked) {
                        if (!body?.otp || body?.otp?.length == 0) {
                            return error(400, { success: false, message: "Enter valid OTP" })
                        } else if (body?.otp != booking.otp) {
                            return error(400, { success: false, message: "OTP is wrong" })
                        }
                        if (booking.tripStatus !== bookingStatus.arrived) {
                            return error(400, { success: false, message: "Wrong Trip Status" })
                        }

                        let maxReachingSeconds = 0;
                        const response = await getDirections(booking?.tripAddress);
                        if (response) {
                            maxReachingSeconds = Number.parseInt(
                                response[0].legs[0]?.duration?.value
                            );
                        }

                        await rideBookingsModel.updateOne(
                            { _id: body._id },
                            {
                                tripStatus: bookingStatus.picked,
                                pickedAt: new Date(),
                                maxReachingSeconds,
                            }
                        );

                        await driversModel.updateOne(
                            { _id: booking.driver },
                            {
                                iAmBusy: true,
                            }
                        );
                        pushData = {
                            notification: {
                                title: `Your ride is started.`,
                                body: "Enjoy your ride.",
                            },
                            data: {
                                notificationType: "bookingStatus",
                                tripStatus: bookingStatus.picked,
                                bookingId: booking._id,
                            },
                        };
                    } else if (body.status == bookingStatus.completed) {
                        if (booking.tripStatus !== bookingStatus.picked) {
                            return error(400, { success: false, message: "Wrong Trip Status" })
                        }

                        const arrivingTime = new Date(booking?.arrivedAt).getTime();
                        const pickupTime = new Date(booking?.pickedAt).getTime();
                        let differenceInMilliseconds: any = pickupTime - arrivingTime;
                        let differenceInSeconds = Math.floor(
                            differenceInMilliseconds / 1000
                        );
                        let waitingChargesObj = {
                            description: "Waiting Charges",
                            charges: 0,
                        };

                        let stopPointTimerWaiting = []
                        if (booking?.wayPointsTripStatus?.length > 0) {
                            for (const element of booking.wayPointsTripStatus) {
                                if (element?.tripStatus === bookingStatus.picked && element?.arrivedAt && element?.pickedAt) {
                                    const arrivingTime = new Date(element?.arrivedAt).getTime();
                                    const pickupTime = new Date(element?.pickedAt).getTime();
                                     differenceInMilliseconds= pickupTime - arrivingTime;
                                     differenceInSeconds = Math.floor(
                                        differenceInMilliseconds / 1000
                                    );
                                    stopPointTimerWaiting.push(differenceInSeconds)
                                }
                            }
                        }

                        if (differenceInSeconds > 150) {
                            waitingChargesObj.charges = Number(Number(((differenceInSeconds - 120) * (waitingChargeRate / 60)).toFixed(2)));
                        }

                        let sum = stopPointTimerWaiting?.reduce((acc, num) => acc + num, 0);
                        let lengthOfStopPointTimerWaiting = stopPointTimerWaiting.length;
                        if (sum > (150 * lengthOfStopPointTimerWaiting)) {
                            waitingChargesObj.charges = waitingChargesObj.charges + Number(Number(((sum - (120 * lengthOfStopPointTimerWaiting)) * (waitingChargeRate / 60)).toFixed(2)))
                        }

                        if (booking?.scheduled?.scheduledAt) {
                            const scheduledTime = new Date(booking.scheduled.scheduledAt).getTime();
                            if ((arrivingTime <= scheduledTime) && (scheduledTime <= pickupTime)) {
                               differenceInMilliseconds = scheduledTime - pickupTime;
                               differenceInSeconds = Math.floor(differenceInMilliseconds / 1000);
                                if (differenceInSeconds > 150) {
                                    waitingChargesObj.charges = Number(Number(((differenceInSeconds - 120) * (waitingChargeRate / 60)).toFixed(2)));
                                } else {
                                    waitingChargesObj.charges = 0
                                }
                            } else if (arrivingTime > scheduledTime) {
                               differenceInMilliseconds = pickupTime - arrivingTime;
                                differenceInSeconds = Math.floor(differenceInMilliseconds / 1000);
                                
                                if (differenceInSeconds > 150) {
                                    waitingChargesObj.charges = Number(Number(((differenceInSeconds - 120) * (waitingChargeRate / 60)).toFixed(2)));
                                } else {
                                    waitingChargesObj.charges = 0
                                }
                            } else {
                                waitingChargesObj.charges = 0
                            }
                        }

                        if (booking?.isForce || body?.isForce) {
                            waitingChargesObj.charges = 0
                        }



                        if (booking?.carPoolDetails?.isBookingUnderPool) {
                            let isDriverUnderPool = await rideBookingsModel.findOne({
                                "carPoolDetails.bookingPoolDetails.poolId": booking?.carPoolDetails?.bookingPoolDetails?.poolId,
                                tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
                                paymentStatus: true,
                                driver: booking.driver,
                            }).lean()
                            if (!isDriverUnderPool) {
                                await driversModel.updateOne(
                                    { _id: booking.driver },
                                    {
                                        isDriverUnderPool: false
                                    }
                                )
                                await rideBookingsModel.updateOne(
                                    {
                                        "carPoolDetails.bookingPoolDetails.poolId": booking?.carPoolDetails?.bookingPoolDetails?.poolId,
                                        "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                                        "carPoolDetails.bookingPoolDetails.endTime": null,
                                        paymentStatus: true,
                                    },
                                    {
                                        "carPoolDetails.bookingPoolDetails.endTime": new Date(),
                                    }
                                );
                            } else {
                                await rideBookingsModel.updateOne(
                                    {
                                        "carPoolDetails.bookingPoolDetails.poolId": booking?.carPoolDetails?.bookingPoolDetails?.poolId,
                                        "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                                        "carPoolDetails.bookingPoolDetails.endTime": null,
                                        paymentStatus: true,
                                    },
                                    {
                                        $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": -booking?.switchRider?.passenger }
                                    }
                                );
                            }
                        }

                        let capturableAmount = Number(
                            Number(
                                booking?.finalBilling?.userBilling?.totalAmount + waitingChargesObj?.charges
                            ).toFixed(2)
                        );
                        let driverEarningIncrement = booking?.finalBilling?.driverEarning?.grandTotal;
                        driverEarningIncrement = await placeDriverBilling(body, waitingChargesObj);

                        if (booking.paymentMethodId == "wallet") {
                            await usersModel.updateOne({ _id: booking.customer }, { $inc: { wallet: -capturableAmount || 0 }, })
                            await userWalletTransactionsModel.create({
                                amount: -capturableAmount || 0,
                                description: "completion of booking",
                                trxType: "Debit",
                                trxId: `WLT${generateRandomNumbers(6)}`,
                                user: booking.customer,
                            });
                            await activityLogsModel.create({
                                title: "Removed money in wallet by user",
                                description: "completion of booking",
                                user: booking.customer,
                            });
                        } else {
                            if (booking?.paymentIntentId?.includes("pi_")) {
                                let paymnetIntentResultData: any = await getPaymentIntentRetrievalResult(booking.paymentIntentId);
                                await capturePaymentIntent(booking?.paymentIntentId || "");
                                if (paymnetIntentResultData && ((capturableAmount * 100) - paymnetIntentResultData.amount_capturable) > 60) {
                                    await autoDeductExtraChargesFromCustomer(booking, Number.parseInt(String((capturableAmount * 100) - paymnetIntentResultData.amount_capturable)));
                                }
                            } else {
                                await squareCompletePayment(booking?.paymentIntentId || "");
                                let paymnetIntentResultData: any = await squarePaymentStatus(booking?.paymentIntentId);
                                let customerDetails = await usersModel.findOne({ _id: booking.customer });
                                if (paymnetIntentResultData && ((capturableAmount * 100) - Number(paymnetIntentResultData?.payment?.amountMoney?.amount)) > 30) {
                                    await createSquarePayment(request, Number.parseInt(String((capturableAmount * 100) - Number(paymnetIntentResultData.payment.amountMoney?.amount))), booking.paymentMethodId, "Other Charges Deduction", booking._id, true, customerDetails?.extraFields, customerDetails?._id)
                                }
                            }
                        }

                        await rideBookingsModel.updateOne({ _id: body._id }, {
                            tripStatus: bookingStatus.completed,
                            isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                            dropedAt: new Date(),
                            $push: { "finalBilling.userBilling.extraCharges": waitingChargesObj },
                            waitingTime: [differenceInSeconds, ...stopPointTimerWaiting],
                        })

                        const isAnyOtherActiveBooking: any = await rideBookingsModel
                            .findOne({
                                $or: [
                                    { "scheduled.scheduledAt": null },
                                    {
                                        $and: [
                                            { "scheduled.scheduledAt": { $ne: null } },
                                            { "scheduled.startRide": true }
                                        ],
                                    },
                                ],
                                driver: booking?.driver,
                                orderNo: { $ne: booking?.orderNo },
                                tripStatus: { $in: [bookingStatus.picked, bookingStatus.ontheway, bookingStatus.arrived] },
                                paymentStatus: true,
                            }).populate("customer");

                        if (!isAnyOtherActiveBooking) {
                            await driversModel.updateOne(
                                { _id: booking.driver },
                                { $inc: { wallet: driverEarningIncrement || 0 }, iAmBusy: false }
                            );
                            sendToAllUsers("DriverLocationUpdate", {
                                driverId: booking?.driver,
                                location: {
                                    type: "Point",
                                    coordinates: [
                                        request?.user?.location?.coordinates[0] || 0,
                                        request?.user?.location?.coordinates[1] || 0,
                                    ],
                                },
                                heading: request?.user?.heading,
                            })
                        } else {
                            await driversModel.updateOne(
                                { _id: booking.driver },
                                { $inc: { wallet: driverEarningIncrement || 0 }, iAmBusy: true }
                            );
                            // sendSocket(isAnyOtherActiveBooking?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: isAnyOtherActiveBooking._id });
                            sendToUserSocket(isAnyOtherActiveBooking?.customer?._id?.toString(), {
                                event: "singlebookingStatusUpdated",
                                data: { bookingId: isAnyOtherActiveBooking._id }
                            })
                        }

                        await driversModel.updateOne(
                            { _id: booking.driver, stopFutureRide: true },
                            {
                                iAmOnline: false,
                                stopFutureRide: false,
                                socket_id: "",
                                missedBookingCount: 0,
                                missedBookingAt: null,
                            }
                        );

                        await driversWalletTransactionModel.create({
                            description: "On ride completion",
                            amount: driverEarningIncrement || 0,
                            trxType: "Credit",
                            driver: booking?.driver,
                            bookingId: booking?._id,
                        });

                        pushData = {
                            notification: {
                                title: `Your ride is completed.`,
                                body: "Enjoy your day.",
                            },
                            data: {
                                notificationType: "bookingStatus",
                                tripStatus: bookingStatus.completed,
                                bookingId: booking._id,
                            },
                        };

                        let userDetails = await usersModel.findOne({ _id: booking.customer }, { rideCount: 1 })
                        let countRides = userDetails?.rideCount
                        if (booking.coupon) {
                            await couponsModel.updateOne(
                                {
                                    _id: booking.coupon,
                                    autoApply: true,
                                    status: true,
                                    validFor: "newUsers",
                                    userId: booking.customer,
                                    usageLimit: { $gte: 1 },
                                },
                                { $inc: { usedCount: 1 } }
                            );
                        }
                        if (countRides === 1) {
                            let userData = await usersModel.findOne({
                                _id: booking.customer,
                                inviteBy: { $ne: null },
                            });
                            let couponDetails = await couponsModel.findOne({ invitedBy: userData?.inviteBy, invitedTo: booking?.customer }).lean()
                            if (userData && userData?.inviteBy && couponDetails) {
                                await couponsModel.create({
                                    code: `${generateInviteCode(6)}${couponDetails.discountAmount}`,
                                    discountType: "percentage",
                                    discountAmount: couponDetails.discountAmount,
                                    uptoAmount: 100,
                                    expiredAt: new Date(
                                        new Date().getTime() + 30 * 24 * 60 * 60 * 1000
                                    ),
                                    usageLimit: 5,
                                    usedCount: 0,
                                    userId: userData.inviteBy,
                                    autoApply: true,
                                    validFor: "newUsers",
                                    invitedBy: userData.inviteBy,
                                    status: true,
                                    invitedTo: booking.customer,
                                });
                            }
                        }
                    }

                    sendToCustomerPushNotification(
                        booking.customer,
                        pushData
                    );

                    let newBookingData: any = await rideBookingsModel
                        .findById(body._id)
                        .populate("driver vehicleType customer")
                        .lean();
                    // sendSocket(newBookingData?.customer?._id?.toString(), "singlebookingStatusUpdated", { bookingId: body._id });
                    sendToUserSocket(newBookingData?.customer?._id?.toString(), {
                        event: "singlebookingStatusUpdated",
                        data: { bookingId: body._id }
                    })
                    return {
                        success: true,
                        message: "Booking status changed.",
                        data: newBookingData,
                    };
                } else {
                    return error(400, { success: false, message: "Booking already finished" })
                }
            }
        } catch (e: any) {
            logger.error({ error: e, msg: e.message });
            return error(400, { success: false, message: "Booking update error" })
        }

    }
};

export const poolDetails = async ({ request, body, query, params, response, error }: any) => {
    try {
        let multiPoolBookingDetails: any = []

        let poolActiveDetails = await rideBookingsModel.find({
            tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
            "carPoolDetails.bookingPoolDetails.poolId": params.id,
            paymentStatus: true,
            driver: request?.user?._id,
        })

        if (poolActiveDetails.length === 0) {
            return { success: true, data: { multiPoolBookingDetails } };
        }

        if (poolActiveDetails.length > 0) {
            for (const singlePoolBooking of poolActiveDetails) {
                let newItem: any = await rideBookingsModel.findById(singlePoolBooking._id).populate("customer driver vehicleType").lean()
                let callDetailsToken = setUpForVoiceCall(0, params.id);
                newItem = { ...newItem, callDetailsToken }
                multiPoolBookingDetails.push(newItem)
            }
        }

        return { success: true, data: { multiPoolBookingDetails } };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
};

export const OnlyPoolDetails = async ({ request, body, query, params, response, error }: any) => {
    try {
        let onlyPoolDetails = await rideBookingsModel.findOne({
            "carPoolDetails.bookingPoolDetails.poolId": params.id,
            "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
            paymentStatus: true,
            driver: request?.user?._id,
        }).lean()

        return { success: true, data: onlyPoolDetails };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
};

export const updatePool = async ({ request, body, query, params, response, error }: any) => {
    try {
        let onlyPoolDetails = await rideBookingsModel.findOne({
            "carPoolDetails.bookingPoolDetails.poolId": body.poolId,
            "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
            paymentStatus: true,
            driver: request?.user?._id,
        }).lean()

        if (onlyPoolDetails) {
            await rideBookingsModel.updateOne({
                "carPoolDetails.bookingPoolDetails.poolId": body.poolId,
                "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
                paymentStatus: true,
                driver: request?.user?._id,
            }, {
                "carPoolDetails.bookingPoolDetails.stopPool": body.stopPool
            })
        }
        return { success: true, message: `Pool updated successfully` };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
};

export const ratingToUser = async ({ request, body, query, params, response, error }: any) => {
    try {
        await rideBookingsModel.updateOne(
            { _id: body.bookingId },
            {
                userRating: {
                    description: body.description,
                    stars: body.stars,
                },
                forceUpdateInDB: true
            }
        );

        return {
            success: true,
            message: "Rating successfully submitted",
        };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
            success: false,
            message: "Something is wrong.",
        })
    }
};

export const tipThanks = async ({ request, body, query, params, response, error }: any) => {
    try {
        let orderDetails: any = await rideBookingsModel
            .findOne({ _id: body?.bookingId })
            .populate("driver customer")
            .lean();
        if (!orderDetails) {
            return error(400, { success: false, message: `Booking not found for tip` })
        }
        await rideBookingsModel.updateOne({ _id: body?.bookingId }, { isThanks: true, forceUpdateInDB: true });
        // sendSocket(orderDetails?.customer?._id?.toString(), "socketLiveNotification", {
        //     notification: {
        //         title: `A Big Thank You!`,
        //         body: `Thanks for being part of our journey!`,
        //     },
        //     data: {
        //         notificationType: "thanksSent",
        //         bookingId: orderDetails._id,
        //     },
        // });
        sendToUserSocket(orderDetails?.customer?._id?.toString(), {
            event: "socketLiveNotification",
            data: {
                notification: {
                    title: `A Big Thank You!`,
                    body: `Thanks for being part of our journey!`,
                },
                data: {
                    notificationType: "thanksSent",
                    bookingId: orderDetails._id,
                },
            }
        })
        sendToCustomerPushNotification(String(orderDetails?.customer?._id), {
            notification: {
                title: `A Big Thank You!`,
                body: `Thanks for being part of our journey!`,
            },
            data: {
                notificationType: "thanksSent",
                bookingId: orderDetails._id,
            },
        });

        return {
            success: true,
            message: `Thanks Status updated successfully`,
        };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: null })
    }
};

export const updateCabBookingWayPointStatus = async ({ request, body, query, params, response, error }: any) => {
    try {
        const { isChargeCut } = body;
        let booking: any = null;
        if (jobSendByRedis) {
            booking = await getBookingFromRedis(body.bookingId);
        } else {
            booking = await rideBookingsModel.findById(body.bookingId).populate("driver customer").lean();
        }
        if (!booking) {
            return error(400, { success: false, message: "Booking not found for status update" })
        }
        if (body.status == bookingStatus.arrived) {
            const redis: any = await getRedis();
            const redisKey = `booking:${String(body?.bookingId)}-${String(booking?.customer?._id)}-${String(booking?.driver?._id)}`;

            let wayPointsTripStatus = (await redis.json.get(redisKey, { path: "$.wayPointsTripStatus" })) || [];
            const lastEntry = wayPointsTripStatus?.length ? wayPointsTripStatus[wayPointsTripStatus?.length - 1] : null;

            if (lastEntry && lastEntry?.tripStatus === bookingStatus?.arrived) {
                return;
            }

            let updateFields: any = {
                isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                $push: {
                    wayPointsTripStatus: {
                        tripStatus: bookingStatus.arrived,
                        arrivedAt: new Date(),
                        pickedAt: null
                    }
                },
            }
            if (jobSendByRedis) {
                await updateBookingInRedis(body.bookingId, updateFields);
            } else {
                await rideBookingsModel.updateOne({ _id: body.bookingId }, updateFields);
            }

            sendToCustomerPushNotification(
                booking.customer._id,
                {
                    notification: {
                        title: `Your Stop has arrived.`,
                        body: "Enjoy your ride.",
                    },
                    data: {
                        notificationType: "bookingStatus",
                        tripStatus: bookingStatus.picked,
                        bookingId: booking._id,
                    },
                }
            );

            sendToDriverPushNotification(booking.driver._id, {
                notification: {
                    title: `Stop Point has arrived`,
                    body: "",
                },
                data: {
                    notificationType: "bookingStatus",
                    bookingId: booking._id,
                },
            });
        }

        if (body.status == bookingStatus.picked) {
            const updateFields = isChargeCut
                ? {
                    isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                    "wayPointsTripStatus.$[elem].pickedAt": new Date(),
                    "wayPointsTripStatus.$[elem].tripStatus": bookingStatus.picked
                }
                : {
                    isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
                    "wayPointsTripStatus.$[elem].arrivedAt": new Date(),
                    "wayPointsTripStatus.$[elem].pickedAt": new Date(),
                    "wayPointsTripStatus.$[elem].tripStatus": bookingStatus.picked
                };

            const baseUpdates = isChargeCut ? {
                isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true
            } : {
                isForce: !booking?.isForce ? (body?.isForce ? body?.isForce : false) : true,
            };

            if (jobSendByRedis) {
                const redis: any = await getRedis();
                const redisKey = `booking:${String(body?.bookingId)}-${String(booking?.customer?._id)}-${String(booking?.driver?._id)}`;
                let details = (await redis.json.get(redisKey)) || [];
                const finalWayPointsTripStatus = details?.wayPointsTripStatus?.map((wp: any) => {
                    if (wp?.tripStatus === bookingStatus?.arrived) {
                        return isChargeCut
                            ? {
                                ...wp,
                                pickedAt: new Date(),
                                tripStatus: bookingStatus.picked
                            }
                            : {
                                ...wp,
                                arrivedAt: new Date(),
                                pickedAt: new Date(),
                                tripStatus: bookingStatus.picked
                            };
                    }
                    return wp;
                });
                await redis.json.set(redisKey, "$.wayPointsTripStatus", finalWayPointsTripStatus);
                await redis.json.set(redisKey, "$.isForce", baseUpdates.isForce);
            } else {
                await rideBookingsModel.updateOne(
                    { _id: body.bookingId },
                    {
                        $set: updateFields
                    },
                    {
                        arrayFilters: [{ "elem.tripStatus": bookingStatus.arrived }]
                    }
                );
            }

            if (booking.customer) {
                sendToCustomerPushNotification(
                    booking.customer._id,
                    {
                        notification: {
                            title: `Your ride is started.`,
                            body: "Enjoy your ride.",
                        },
                        data: {
                            notificationType: "bookingStatus",
                            tripStatus: bookingStatus.picked,
                            bookingId: booking._id,
                        },
                    }
                );
            }

        }
        // sendSocket([booking?.driver?._id?.toString(), booking?.customer?._id?.toString()], "singlebookingStatusUpdated", { bookingId: body.bookingId });
        sendToUserSocket(booking?.customer?._id?.toString(), {
            event: "singlebookingStatusUpdated",
            data: {
                bookingId: body.bookingId
            }
        })
        sendToDriverSocket(booking?.driver?._id?.toString(), {
            event: "singlebookingStatusUpdated",
            data: {
                bookingId: body.bookingId
            }
        })
        return {
            success: true,
            message: "Booking status changed.",
            data: {},
        };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, message: "Booking not found error" })
    }
};