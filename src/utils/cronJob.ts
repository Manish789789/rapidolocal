// import { findNearDriverForAllWebsites } from "@/modules/drivers/controllers/admin/cron.controller";
// import driversModel from "@/modules/drivers/models/drivers.model";
// import { makeTransferMoney } from "@/modules/paymentGateways/stripe.controller";
// import mongoose from "mongoose";
// import cron from "node-cron";
// import { logger } from "./logger";
// import { surgeUpdated } from "./fetchSocketId";
// import { getWeatherDetails } from "./map/mapboxHelper";
// import geoAreasModel from "@/modules/geo-areas/models/geoAreas.model";
// import {
//     inquirePayment,
//     makeTransferMoneyByRBC,
//     saveDriverPayoutCsvOnWeekEnd,
//     saveDriverUnPaidDataToCsvOnWeekEnd,
//     sleep,
// } from "@/modules/rbcBank/helper";
// import driversWithdrawalModel from "@/modules/drivers/models/driversWithdrawal.model";
// import {
//     autoDeletePricingFromRedis,
//     findNearDriverForAllWebsitesFromRedis,
// } from "@/modules/drivers/controllers/admin/cronRedis.controller";
// import { jobSendByRedis } from "./constant";

// cron.schedule("*/5 * * * * *", async () => {
//     if (jobSendByRedis) {
//         await findNearDriverForAllWebsitesFromRedis();
//     } else {
//         await findNearDriverForAllWebsites();
//     }
// });

// cron.schedule("*/30 * * * *", async () => {
//     await autoUpdateSurge();
// });

// cron.schedule(
//     "0 0 * * 1",
//     async () => {
//         await autoCalcWithral();
//     },
//     {
//         timezone: "Canada/Newfoundland",
//     }
// );
