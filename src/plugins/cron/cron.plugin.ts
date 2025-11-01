import momentTime from "moment-timezone";
import fs from "fs";
import { Elysia } from "elysia";
import { cron } from "@elysiajs/cron";
import { jobSendByRedis } from "@/utils/constant";
import {
  findNearDriverForAllWebsitesFromRedis,
  updateBusyDriverToFreeFromRedis,
  updateDriverLocFromRedis,
} from "@/modules/drivers/controllers/admin/cronRedis.controller";
import { findNearDriverForAllWebsites } from "@/modules/drivers/controllers/admin/cron.controller";
import geoAreasModel from "@/modules/geo-areas/models/geoAreas.model";
import { getWeatherDetails } from "@/utils/map/mapboxHelper";
import { surgeUpdated } from "@/utils/fetchSocketId";
import { logger } from "@/utils/logger";
import { withDatabaseReady } from "@/utils/memoryOptimizer";
import mongoose from "mongoose";
import driversModel from "@/modules/drivers/models/drivers.model";
import {
  inquirePayment,
  makeTransferMoneyByRBC,
  saveDriverPayoutCsvOnWeekEnd,
  saveDriverUnPaidDataToCsvOnWeekEnd,
  sleep,
} from "@/modules/rbcBank/helper";
import driversWithdrawalModel from "@/modules/drivers/models/driversWithdrawal.model";
import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import driversWalletTransactionModel from "@/modules/drivers/models/driversWalletTransaction.model";
import GeoLatLongPlacesModel from "@/modules/places/models/GeoLatLongPlaces.model";
import GeoPlacesModel from "@/modules/places/models/GeoPlaces.model";
import paymentMethodsModel from "@/modules/users/models/paymentMethods.model";
import couponsModel from "@/modules/coupons/models/coupons.model";
import { redisMigrateWithDb } from "@/utils/redisHelper";

export const cronPlugin = new Elysia()
  .use(
    cron({
      name: "find-near-driver",
      pattern: "*/5 * * * * *",
      run() {
        withDatabaseReady(async () => {
          if (jobSendByRedis) {
            await findNearDriverForAllWebsitesFromRedis();
          } else {
            await findNearDriverForAllWebsites();
          }
        }, "find-near-driver cron job");
      },
    })
  )
  .use(
    cron({
      name: "update-data",
      pattern: "*/10 * * * * *",
      run() {
        withDatabaseReady(async () => {
          updateBusyDriverToFreeFromRedis();
          updateDriverLocFromRedis();
        }, "update-data cron job");
      },
    })
  )
  .use(
    cron({
      name: "update-data-db",
      pattern: "*/59 * * * * *",
      run() {
        withDatabaseReady(async () => {
          redisMigrateWithDb();
        }, "update-data cron job in db");
      },
    })
  )
  .use(
    cron({
      name: "auto-update-surge",
      pattern: "*/30 * * * *",
      run() {
        withDatabaseReady(async () => {
          autoUpdateSurge();
        }, "auto-update-surge cron job");
      },
    })
  )
  .use(
    cron({
      name: "auto-calc-withdrawal",
      pattern: "0 0 * * 1",
      timezone: "Canada/Newfoundland",
      run() {
        withDatabaseReady(async () => {
          await autoCalcWithral();
        }, "auto-calc-withdrawal cron job");
      },
    })
  );

export const autoUpdateSurge = async () => {
  try {
    await geoAreasModel.updateMany(
      {},
      {
        $set: {
          surgeMultiplier: 1.0,
          surgeDemandSupply: 1.0,
          weatherSurge: 0,
        },
      }
    );
    let allGeoAreas: any = await geoAreasModel.find({}).lean();
    for (const singleGeoArea of allGeoAreas) {
      let zoneDetails: any = await geoAreasModel
        .findOne({ _id: singleGeoArea._id })
        .lean();
      // let countOfDrivers = await findActiveDriversInZone(singleGeoArea);

      //admin surge
      // if (countOfDrivers === 0) {
      //     await geoAreasModel.updateOne(
      //         {
      //             _id: singleGeoArea._id
      //         },
      //         {
      //             $set: {
      //                 staticSurge: .1,
      //                 surgeMultiplier: zoneDetails?.surgeDemandSupply + .1,
      //             }
      //         }
      //     )
      // } else {
      //     await geoAreasModel.updateOne(
      //         {
      //             _id: singleGeoArea._id
      //         },
      //         {
      //             $set: {
      //                 staticSurge: 0,
      //                 surgeMultiplier: zoneDetails?.surgeDemandSupply + 0,
      //             }
      //         }
      //     )
      // }

      //weather surge
      if (process.env.isTestMode === "false") {
        zoneDetails = await geoAreasModel
          .findOne({ _id: singleGeoArea._id })
          .lean();
        const coordinates = singleGeoArea?.location?.coordinates[0]?.map(
          (point: any) => [point[0], point[1]]
        );
        const centroid = coordinates.reduce(
          (acc: any, coord: any) => [acc[0] + coord[0], acc[1] + coord[1]],
          [0, 0]
        );
        centroid[0] /= coordinates.length;
        centroid[1] /= coordinates.length;

        let getWeatherDetailsSurge = await getWeatherDetails(
          centroid[1],
          centroid[0]
        );
        await geoAreasModel.updateOne(
          {
            _id: singleGeoArea._id,
          },
          {
            $set: {
              surgeMultiplier:
                zoneDetails?.surgeDemandSupply +
                zoneDetails?.staticSurge +
                getWeatherDetailsSurge?.underSurge,
              weatherSurge: getWeatherDetailsSurge?.underSurge,
            },
          }
        );
      }
    }
    await surgeUpdated();
  } catch (e: any) {
    logger.error({ e, msg: e.message });
  }
};

export const autoCalcWithral = async () => {
  try {
    const verifiedDrivers = await driversModel.aggregate([
      {
        $match: {
          "vehicleInfo.isApproved": true,
          wallet: { $gte: 1 },
          // _id: {
          //   $in: [
          //     new mongoose.Schema.Types.ObjectId('664b7fa257c2aecb993f059f')
          //   ]
          // }
        },
      },
      {
        $sort: { wallet: 1 },
      },
      {
        $project: {
          _id: 1,
          wallet: 1,
        },
      },
    ]);

    for (let singleDriverPaymentDetails of verifiedDrivers) {
      let driverDetails: any = await driversModel
        .findOne({ _id: singleDriverPaymentDetails._id })
        .lean();
      saveDriverPayoutCsvOnWeekEnd({
        driverId: String(driverDetails?._id),
        fullName: driverDetails?.fullName,
        email: driverDetails?.email,
        phone: driverDetails?.phone,
        amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2))
      });
      const withdrawalFilter = {
        driver: driverDetails._id,
        txnId: "",
        txnTime: null,
        confirmation_number: "",
        status: 0,
      };
      try {
        await driversWithdrawalModel.deleteMany(withdrawalFilter);
      } catch (error) {
      }
      await driversWithdrawalModel.create({
        ...withdrawalFilter,
        amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2)),
      });
      if (driverDetails.bankDetails) {
        let res = await makeTransferMoneyByRBC(
          driverDetails,
          parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2))
        );
        if (res) {
          if (res.status === "PROCESSED" || res.status === "PROCESSING") {
            await driversWithdrawalModel.findOneAndUpdate(
              {
                driver: driverDetails._id,
                amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2)),
                status: 0,
                txnId: "",
                txnTime: null,
                confirmation_number: "",
              },
              {
                $set: {
                  txnId: res?.payment_id || "",
                  txnTime: new Date(),
                  confirmation_number: res?.confirmation_number || "",
                  status: res.status === "PROCESSING" ? 1 : 2,
                },
              },
              {
                sort: { createdAt: -1 },
              }
            );
          }
          if (res.status === "PROCESSED") {
            await driversModel.findOneAndUpdate(
              { _id: driverDetails?._id },
              {
                $inc: {
                  wallet: -parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2)),
                  lifeTimeEarning: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2)),
                },
              }
            );
            saveDriverUnPaidDataToCsvOnWeekEnd(
              {
                driverId: String(driverDetails._id),
                fullName: driverDetails.fullName,
                email: driverDetails.email,
                phone: driverDetails.phone,
                amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2)),
              },
              "true"
            );
          }
          if (res.status === "FAILED") {
            saveDriverUnPaidDataToCsvOnWeekEnd(
              {
                driverId: String(driverDetails._id),
                fullName: driverDetails.fullName,
                email: driverDetails.email,
                phone: driverDetails.phone,
                amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2))
              },
              "false"
            );
          }
        } else {
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(driverDetails._id),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2)),
            },
            "false"
          );
        }
      } else {
        saveDriverUnPaidDataToCsvOnWeekEnd(
          {
            driverId: String(driverDetails._id),
            fullName: driverDetails.fullName,
            email: driverDetails.email,
            phone: driverDetails.phone,
            amount: parseFloat(Number(singleDriverPaymentDetails.wallet).toFixed(2))
          },
          "false"
        );
      }
      // }
    }

    await sleep(45 * 1000);

    let processingTransactions = await driversWithdrawalModel
      .find({ status: 1 })
      .lean();

    for (const singleDriverProcessingTransactions of processingTransactions) {
      let singlePaymentStatus = await inquirePayment(
        singleDriverProcessingTransactions.txnId
      );
      let driverDetails: any = await driversModel
        .findOne({ _id: singleDriverProcessingTransactions.driver })
        .lean();

      switch (singlePaymentStatus.status) {
        case "PROCESSING":
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(singleDriverProcessingTransactions.driver),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: parseFloat(Number(singleDriverProcessingTransactions.amount).toFixed(2))
            },
            "PROCESSING"
          );
          break;

        case "PROCESSED":
          await driversWithdrawalModel.findOneAndUpdate(
            { _id: singleDriverProcessingTransactions?._id },
            {
              status: 2,
            }
          );
          await driversModel.findOneAndUpdate(
            { _id: singleDriverProcessingTransactions?.driver },
            {
              $inc: {
                wallet: -parseFloat(Number(singleDriverProcessingTransactions.amount).toFixed(2)),
                lifeTimeEarning: parseFloat(Number(singleDriverProcessingTransactions.amount).toFixed(2)),
              },
            }
          );
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(singleDriverProcessingTransactions.driver),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: parseFloat(Number(singleDriverProcessingTransactions.amount).toFixed(2)),
            },
            "true"
          );
          break;

        case "FAILED":
          await driversWithdrawalModel.findOneAndDelete({
            _id: singleDriverProcessingTransactions._id,
          });
          saveDriverUnPaidDataToCsvOnWeekEnd(
            {
              driverId: String(singleDriverProcessingTransactions.driver),
              fullName: driverDetails.fullName,
              email: driverDetails.email,
              phone: driverDetails.phone,
              amount: parseFloat(Number(singleDriverProcessingTransactions.amount).toFixed(2)),
            },
            "false"
          );
          break;

        default:
          break;
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const dataMigrate = async () => {
  try {
    const { ObjectId } = mongoose.Types;

    function fixDates(obj: any): any {
      if (Array.isArray(obj)) {
        return obj.map(fixDates);
      } else if (obj && typeof obj === "object") {
        if (obj.$date) {
          return new Date(obj.$date);
        }
        return Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, fixDates(v)])
        );
      }
      return obj;
    }

    function fixMongoExtendedJSON(obj: any): any {
      if (Array.isArray(obj)) {
        return obj.map(fixMongoExtendedJSON);
      } else if (obj && typeof obj === "object") {
        // Handle $date
        if (obj.$date) {
          return new Date(obj.$date);
        }
        // Handle $oid
        if (obj.$oid) {
          return new ObjectId(obj.$oid);
        }
        // Handle nested objects
        return Object.fromEntries(
          Object.entries(obj).map(([k, v]) => [k, fixMongoExtendedJSON(v)])
        );
      }
      return obj;
    }

    //driver data
    let raw = fs.readFileSync("drivers.json", "utf-8");
    let drivers = JSON.parse(raw);
    let cleaned = drivers.map((d: any) => {
      if (d.paymentDetails?._id) delete d.paymentDetails._id;
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
        country: {
          name: "CA",
          countryCode: "1",
          currencyCode: "CAD",
          currencySymbol: "$",
        },
      };
    });
    try {
      // await driversModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //user data
    raw = fs.readFileSync("users.json", "utf-8");
    let users = JSON.parse(raw);
    cleaned = users.map((d: any) => {
      if (d.address?._id) delete d.address._id;
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
        country: {
          name: "CA",
          countryCode: "1",
          currencyCode: "CAD",
          currencySymbol: "$",
        },
      };
    });
    try {
      // await usersModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //shortcut booking data
    raw = fs.readFileSync("shortcutBookings.json", "utf-8");
    let shortcuts = JSON.parse(raw);
    cleaned = shortcuts.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await shortcutModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //media
    raw = fs.readFileSync("media.json", "utf-8");
    let medias = JSON.parse(raw);
    cleaned = medias.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await mediaModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //driverWalletTransaction
    raw = fs.readFileSync("driverwallettransactions.json", "utf-8");
    let driverWalletTransactions = JSON.parse(raw);
    cleaned = driverWalletTransactions.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await driversWalletTransactionModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //driverWithdrawals
    raw = fs.readFileSync("driverwithdrawals.json", "utf-8");
    let driverWithdrawalsd = JSON.parse(raw);
    cleaned = driverWithdrawalsd.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await driversWithdrawalModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //coupons
    raw = fs.readFileSync("coupons.json", "utf-8");
    let couponsd = JSON.parse(raw);
    cleaned = couponsd.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await couponsModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //cabBookingPaymentMethods
    raw = fs.readFileSync("cabBookingPaymentMethods.json", "utf-8");
    let cabBookingPaymentMethodsd = JSON.parse(raw);
    cleaned = cabBookingPaymentMethodsd.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await paymentMethodsModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //cabBookings
    raw = fs.readFileSync("cabBookings.json", "utf-8");
    let cabBookingsD = JSON.parse(raw);
    cleaned = cabBookingsD.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
        tripStatus:
          d.tripStatus === "Canceled"
            ? bookingStatus?.canceled
            : d.tripStatus === "canceled"
              ? bookingStatus?.canceled
              : d.tripStatus,
        country: {
          name: "CA",
          countryCode: "1",
          currencyCode: "CAD",
          currencySymbol: "$",
        },
        expectedBilling: {
          km: d.km,
          kmText: d.km,
          duration: d.km,
          durationText: d.km,
          pricing: d.km,
          driverEarning: fixMongoExtendedJSON({
            ...d.driverEarning,
            discount: Number(d.driverEarning.discount),
          }),
          userBilling: fixMongoExtendedJSON({
            ...d.userBilling,
            discount: Number(d?.userBilling?.discount) || 0.0,
          }),
        },
        finalBilling: {
          km: d.km,
          kmText: d.km,
          duration: d.km,
          durationText: d.km,
          pricing: d.km,
          driverEarning: fixMongoExtendedJSON({
            ...d.driverEarning,
            discount: Number(d.driverEarning.discount),
          }),
          userBilling: fixMongoExtendedJSON({
            ...d.userBilling,
            discount: Number(d?.userBilling?.discount) || 0.0,
          }),
        },
      };
    });

    try {
      // await rideBookingsModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //geoPlaces
    raw = fs.readFileSync("geoplaces.json", "utf-8");
    let geoPlacesD = JSON.parse(raw);
    cleaned = geoPlacesD.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await GeoPlacesModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }

    //geoLatLongPlaces
    raw = fs.readFileSync("geolatlongplaces.json", "utf-8");
    let geoLatLongPlacesD = JSON.parse(raw);
    cleaned = geoLatLongPlacesD.map((d: any) => {
      return {
        ...fixDates(d),
        ...fixMongoExtendedJSON(d),
      };
    });
    try {
      // await GeoLatLongPlacesModel.insertMany(cleaned);
    } catch (error: any) {
      logger.error({ error: error, msg: error.message });
    }
  } catch (error: any) {
    logger.error({ error: error, msg: error.message });
  }
};

export const paymentWalletMigrate = async () => {
  try {
    let driverTransactions = await driversWalletTransactionModel
      .find({ amount: 0 })
      .lean();
    for (const singleDriverTransaction of driverTransactions) {
      let driverTransactionsCount = await driversWalletTransactionModel
        .find({ _id: singleDriverTransaction?.bookingId })
        .lean();
      if (driverTransactionsCount.length > 1) {
        await driversWalletTransactionModel.findOneAndDelete({
          _id: singleDriverTransaction?._id,
        });
        continue;
      }

      let relatedBooking: any = await rideBookingsModel
        .findOne({ _id: singleDriverTransaction?.bookingId })
        .lean();
      await driversWalletTransactionModel.findOneAndUpdate(
        { _id: singleDriverTransaction?._id },
        {
          amount: relatedBooking?.finalBilling?.driverEarning?.grandTotal || 0,
        }
      );
      await driversModel.findOneAndUpdate(
        { _id: singleDriverTransaction?.driver },
        {
          $inc: {
            wallet:
              relatedBooking?.finalBilling?.driverEarning?.grandTotal || 0,
          },
        }
      );
    }
  } catch (error: any) {
    logger.error({ error: error, msg: error.message });
  }
};

export const walletMigrate = async () => {
  try {
    let driverList = await driversModel
      .find({
        "vehicleInfo.isApproved": true,
        wallet: { $gte: 1 },
        _id: "68acdd504e39c69262537025",
      })
      .lean();

    let collect = [];
    const startDate = momentTime
      .tz("2025-09-29 00:00:00", "Canada/Newfoundland")
      .utc()
      .toDate();
    const endDate = momentTime
      .tz("2025-10-05 23:59:59", "Canada/Newfoundland")
      .utc()
      .toDate();

    for (let item of driverList) {
      let result = await rideBookingsModel.aggregate([
        {
          $match: {
            driver: item._id,
            dropedAt: {
              $gte: startDate,
              $lte: endDate,
            },
            $or: [
              { tripStatus: "completed" },
              { "finalBilling.driverEarning.cancellationPrice": { $gt: 0 } },
            ],
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$finalBilling.driverEarning.grandTotal" },
          },
        },
      ]);
      const { totalAmount } = result?.[0] || {
        totalAmount: 0,
      };

      let walletTransactions = await driversWalletTransactionModel.aggregate([
        {
          $match: {
            driver: item._id,
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalWallet: { $sum: "$amount" },
          },
        },
      ]);
      const { totalWallet } = walletTransactions?.[0] || {
        totalWallet: 0,
      };
      // console.log({ totalAmount, totalWallet })

      let diff = totalAmount - totalWallet;
      if (Math.abs(diff) > 2) {
        collect.push({
          driver: item._id,
          name: item.fullName,
          totalAmount: Math.round(
            parseInt(Number(totalAmount || 0).toFixed(2))
          ),
          totalWallet: Math.round(
            parseInt(Number(totalWallet || 0).toFixed(2))
          ),
        });
      }
    }
  } catch (error: any) {
    logger.error({ error: error, msg: error.message });
  }
};
