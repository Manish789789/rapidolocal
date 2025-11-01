import { generateRandomNumbers, toFixed } from "@/utils";
import model from "../../models/drivers.model";
import moment from "moment";
import driversWalletTransactionModel from "../../models/driversWalletTransaction.model";
import { resources } from "@/utils/resources";
import driversModel from "../../models/drivers.model";
import activityLogsModel from "@/modules/activityLogs/models/activityLogs.model";
import { convertJson } from "@/utils/convertjson";
import rideBookingsModel, {
  bookingStatus,
} from "@/modules/ride-bookings/models/rideBookings.model";
import { logger } from "@/utils/logger";
import {
  generatePdfFile,
  generateUniquePdfFileName,
  taxPdfFile,
} from "@/utils/invoicePdf";
import fs from "fs";
import { unlink } from "fs/promises";
import path from "path";
import driversAuthActivityModel from "../../models/driversAuthActivity.model";
import axios from "axios";
import AWS from "aws-sdk";
import sharp from "sharp";
import driverMediaModel from "../../models/driverMedia.model";
import driversWithdrawalModel from "../../models/driversWithdrawal.model";
import { payoutAllPendingDrivers } from "@/modules/admins/controllers/admin/customPayoutHandler.controller";

export const { index, create, edit, update, deleteItem, multiDeleteItem } =
  resources(model);

export const block = async ({ error, params }: any) => {
  try {
    await driversModel.updateOne(
      { _id: params.id },
      { isBlocked: moment().add(10, "years").format() }
    );
    await driversAuthActivityModel.updateMany(
      { user: params.id },
      { $set: { fcmToken: null } }
    );
    await activityLogsModel.create({
      title: "Driver Blocked",
      description: "Blocked by admin",
      driver: params.id,
    });
    return { success: true, message: "Driver successfully blocked" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const unBlock = async ({ error, params }: any) => {
  try {
    await driversModel.updateOne(
      { _id: params.id },
      { isBlocked: moment().add(-1, "day").format() }
    );
    activityLogsModel.create({
      title: "Driver Unblock",
      description: "Unblock by admin",
      driver: params.id,
    });
    return { success: true, message: "Driver successfully unblocked" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};

export const addMoney = async ({ error, body, params }: any) => {
  try {
    let updatedUser = await driversModel.findOneAndUpdate(
      { _id: params.id },
      { $inc: { wallet: body.amount } }
    );

    await driversWalletTransactionModel.create({
      amount: body.amount,
      description: "Added money in wallet by admin",
      trxType: "Credit",
      trxId: `WLT${generateRandomNumbers(6)}`,
      driver: params.id,
      currency: {
        currencyCode: updatedUser?.country?.currencyCode,
        currencySymbol: updatedUser?.country?.currencySymbol,
      },
    });
    await activityLogsModel.create({
      title: "Added money in wallet by admin",
      description: body.description,
      driver: params.id,
    });
    return { success: true, message: "Money successfully added" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const deductMoney = async ({ error, body, params }: any) => {
  try {
    const driver = await driversModel.findOne({ _id: params.id });
    if (body.amount > driver?.wallet) {
      return error(400, {
        success: false,
        data: {},
        message: "Insufficient wallet balance",
      });
    }
    let updatedUser = await driversModel.findOneAndUpdate(
      { _id: params.id },
      { $inc: { wallet: -body.amount } }
    );
    await driversWalletTransactionModel.create({
      amount: -body.amount,
      description: "Deducted money in wallet by admin",
      trxType: "Debit",
      trxId: `WLT${generateRandomNumbers(6)}`,
      driver: params.id,
      currency: {
        currencyCode: updatedUser?.country?.currencyCode,
        currencySymbol: updatedUser?.country?.currencySymbol,
      },
    });
    await activityLogsModel.create({
      title: "Deducted money in wallet by admin",
      description: body.description,
      driver: params.id,
    });
    return { success: true, message: "Money successfully added" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};

export const getDriversLocations = async () => {
  try {
    return await driversModel
      .find()
      .select(
        "fullName avatar phone iAmBusy iAmOnline uniqueID location.coordinates"
      )
      .lean();
  } catch (err) {
    return [];
  }
};
export const getDriversCsv = async ({ error, body }: any) => {
  if (!body.filter) {
    return error(400, {
      success: false,
      data: {},
      message: "Please provide filter",
    });
  }
  try {
    const drivers = await driversModel
      .find(body.filter)
      .select(body.selectedField);
    const fileUrl = await convertJson(drivers, body.selectedField);
    return { ...fileUrl, message: "Drivers successfully fetched" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const analytics = async ({ params, error }: any) => {
  try {
    const userId = params.id;
    const user = await model.findOne({ _id: userId });
    if (!user) {
      return error(400, {
        success: false,
        message: "User not found",
        data: {},
      });
    }

    const completeRides = await rideBookingsModel.countDocuments({
      driver: userId,
      tripStatus: bookingStatus.completed,
    });
    const totalRides = await rideBookingsModel.countDocuments({
      driver: userId,
    });
    const paid = await rideBookingsModel.countDocuments({
      driver: userId,
      paymentStatus: true,
    });
    const cancelledRides = await rideBookingsModel.countDocuments({
      driver: userId,
      canceledBy: "admin",
      tripStatus: "canceled", // adjust this field based on your schema
    });
    const paidCancelledRides = await rideBookingsModel.countDocuments({
      driver: userId,
      tripStatus: "canceled",
      canceledBy: "admin",
      paymentStatus: true,
    });
    const unpaidCancelledRides = await rideBookingsModel.countDocuments({
      driver: userId,
      tripStatus: "canceled",
      canceledBy: "admin",
      paymentStatus: false,
    });

    return {
      success: true,
      data: {
        userId,
        totalRides,
        completeRides,
        paid,
        cancelledRides: {
          total: cancelledRides,
          paid: paidCancelledRides,
          unpaid: unpaidCancelledRides,
        },
      },
      message: "Analytics fetched successfully",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, {
      success: false,
      message: "Internal Server Error",
      data: {},
    });
  }
};
export const approve = async ({ params, error }: any) => {
  try {
    const userId = params.id;
    const user = await model.findOne({ _id: userId });
    if (!user) {
      return error(400, {
        success: false,
        message: "User not found",
        data: {},
      });
    }

    await driversModel.updateOne(
      { _id: params.id },
      { isApproved: 3, "vehicleInfo.isApproved": true }
    );
    activityLogsModel.create({
      title: "Driver Approved",
      description: "Approved by admin",
      driver: params.id,
    });
    return { success: true, message: "Driver successfully approved" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, {
      success: false,
      message: "Internal Server Error",
      data: {},
    });
  }
};
export const unapprove = async ({ params, error }: any) => {
  try {
    const userId = params.id;
    const user = await model.findOne({ _id: userId });
    if (!user) {
      return error(400, {
        success: false,
        message: "User not found",
        data: {},
      });
    }
    if (user.iAmBusy) {
      return error(400, {
        success: false,
        message: "Driver is busy",
        data: {},
      });
    }
    if (user.iAmOnline) {
      const updatedDriverData = {
        iAmOnline: false,
        socket_id: "",
        missedBookingCount: 0,
        missedBookingAt: null,
        stopFutureRide: false,
      };
      await driversModel.updateOne({ _id: params.id }, updatedDriverData);
    }
    await driversModel.updateOne(
      { _id: params.id },
      { isApproved: 2, "vehicleInfo.isApproved": false }
    );
    activityLogsModel.create({
      title: "Driver Unapproved",
      description: "Unapproved by admin",
      driver: params.id,
    });
    return { success: true, message: "Driver successfully unapproved" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, {
      success: false,
      message: "Internal Server Error",
      data: {},
    });
  }
};
export const earningReportByWeek = async ({ params, body, error }: any) => {
  try {
    const timezoneNST = "America/St_Johns";
    const startDateUTC = body?.startDate;
    const startDateNST = moment
      .utc(startDateUTC)
      .tz(timezoneNST)
      .startOf("day");
    let startOfWeek = startDateNST.clone().startOf("isoWeek").startOf("day");
    let endOfWeek = startDateNST.clone().endOf("isoWeek").endOf("day");

    if (startDateNST.isoWeekday() === 7) {
      startOfWeek = startOfWeek.add(1, "week");
      endOfWeek = endOfWeek.add(1, "week");
    }

    const weekArray: any = [];
    let currentDay = startOfWeek.clone();
    while (currentDay <= endOfWeek) {
      weekArray.push(currentDay.format("YYYY-MM-DD"));
      currentDay.add(1, "day");
    }
    const datas = await model.findOne({ _id: params.id });
    const [weekChart, totalEarning, totalRidesWithTime, cancelationFee] =
      await Promise.all([
        driversWalletTransactionModel
          .aggregate([
            {
              $match: {
                driver: datas._id,
                createdAt: {
                  $gte: startOfWeek.toDate(),
                  $lt: endOfWeek.toDate(),
                },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                    timezone: "America/St_Johns",
                  },
                },
                totalAmount: { $sum: "$amount" },
              },
            },
          ])
          .then((result) => {
            const resultMap = new Map(
              result.map(({ _id, totalAmount }) => [
                _id,
                {
                  label: moment(_id).format("dddd").slice(0, 1),
                  value: parseFloat(Number(totalAmount).toFixed(2)),
                },
              ])
            );

            return weekArray.map(
              (date: any) =>
                resultMap.get(date) || {
                  label: moment(date).format("dddd").slice(0, 1),
                  value: 0,
                }
            );
          })
          .catch((e) => {
            return [];
          }),
        driversWalletTransactionModel
          .aggregate([
            {
              $match: {
                driver: datas._id,
                createdAt: {
                  $gte: startOfWeek.toDate(),
                  $lt: endOfWeek.toDate(),
                },
              },
            },
            {
              $group: {
                _id: null,
                totalEarning: { $sum: "$amount" },
              },
            },
          ])
          .then((result: any) => {
            if (result.length > 0) {
              const { totalEarning } = result[0];
              return totalEarning;
            }
            return 0;
          }),
        rideBookingsModel
          .aggregate([
            {
              $match: {
                driver: datas._id,
                tripStatus: bookingStatus.completed,
                dropedAt: {
                  $gte: startOfWeek.toDate(),
                  $lt: endOfWeek.toDate(),
                },
              },
            },
            {
              $addFields: {
                timeDifference: {
                  $subtract: ["$dropedAt", "$pickedAt"],
                },
              },
            },
            {
              $group: {
                _id: null,
                totalRides: { $sum: 1 },
                totalTaxes: { $sum: "$finalBilling.driverEarning.driverTax" },
                totalTips: { $sum: "$finalBilling.driverEarning.tips" },
                subTotal: { $sum: "$finalBilling.driverEarning.subTotal" },
                expenses: { $sum: "$finalBilling.driverEarning.expenses" },
                grandTotal: { $sum: "$finalBilling.driverEarning.grandTotal" },
                totalTime: { $sum: "$timeDifference" },
              },
            },
          ])
          .then((result: any) => {
            if (result.length > 0) {
              const {
                totalRides,
                totalTime,
                totalTips,
                totalTaxes,
                subTotal,
                grandTotal,
                expenses,
              } = result[0];
              return {
                totalRides,
                totalTime,
                totalTips,
                newFare: toFixed(subTotal) - toFixed(expenses),
                totalTaxes,
                grandTotal,
              };
            }
            return {
              totalRides: 0.0,
              totalTime: 0.0,
              totalTips: 0.0,
              newFare: 0.0,
              totalTaxes: 0.0,
              grandTotal: 0.0,
            };
          }),
        driversWalletTransactionModel
          .aggregate([
            {
              $match: {
                driver: datas._id,
                description: "On ride cancellation",
                trxType: "Credit",
                createdAt: {
                  $gte: startOfWeek.toDate(),
                  $lt: endOfWeek.toDate(),
                },
              },
            },
            {
              $group: {
                _id: null,
                totalEarning: { $sum: "$amount" },
              },
            },
          ])
          .then((result: any) => {
            if (result.length > 0) {
              const { totalEarning } = result[0];
              return totalEarning;
            }
            return 0;
          }),
      ]);

    let data = {
      weekChart,
      weekTotal: {
        totalEarning,
        totalRides: totalRidesWithTime.totalRides,
        totalTime: totalRidesWithTime.totalTime,
      },
      breakdown: [
        { title: "Net Fare", value: `$${toFixed(totalRidesWithTime.newFare)}` },
        { title: "Tips", value: `$${toFixed(totalRidesWithTime.totalTips)}` },
        { title: "Taxes", value: `$${toFixed(totalRidesWithTime.totalTaxes)}` },
        { title: "Bonus", value: `$0.00` },
        { title: "Cancellation fee", value: `$${toFixed(cancelationFee)}` },
        { title: "Penality", value: `$0.00`, txnType: "debit" },
        {
          title: "Total Earning",
          value: `$${toFixed(
            toFixed(totalRidesWithTime.grandTotal) + toFixed(cancelationFee)
          )}`,
        },
      ],
    };
    return { success: true, data: data };
  } catch (e: any) {
    return error(400, { success: false, data: null });
  }
};
export const taxInfoListing = async ({ params, body, error }: any) => {
  try {
    const user = await driversModel.findOne(params.driverId);
    const createdAt = user.createdAt;
    const startYear = new Date(createdAt).getFullYear();
    const startMonth = new Date(createdAt).getMonth();
    const endYear = new Date().getFullYear();
    const endMonth = new Date().getMonth();

    const result = [];

    let year = startYear;
    let month = startMonth;

    while (year < endYear || (year === endYear && month <= endMonth)) {
      result.push({
        year: year,
        month: month + 1,
      });
      month++;
      if (month === 12) {
        month = 0;
        year++;
      }
    }
    return {
      message: "Tax info listing fetched successfully",
      data: result,
    };
  } catch (e) {
    return error(400, { success: false, message: `list not available` });
  }
};
export const taxInfo = async ({ body, error, params }: any) => {
  try {
    let year = body.year;
    let month = body.month;
    const user = await driversModel.findOne({ _id: params.id });
    let nextDate: any, prevDate: any;
    if (year && month) {
      const firstDayOfMonth = new Date(`${month} 1, ${year}`);
      const lastDayOfMonth = new Date(
        firstDayOfMonth.getFullYear(),
        firstDayOfMonth.getMonth() + 1,
        0
      );
      prevDate = `${firstDayOfMonth.getMonth() + 1
        }-01-${firstDayOfMonth.getFullYear()}`;
      nextDate = `${lastDayOfMonth.getMonth() + 1
        }-${lastDayOfMonth.getDate()}-${lastDayOfMonth.getFullYear()}`;
    }
    if (year && !month) {
      nextDate = `12-31-${year}`;
      prevDate = `01-01-${year}`;
    }
    const aggregateData = await rideBookingsModel.aggregate([
      {
        $match: {
          driver: user?._id,
          tripStatus: bookingStatus.completed,
          createdAt: {
            $gte: new Date(prevDate),
            $lte: new Date(nextDate),
          },
        },
      },
      {
        $project: {
          finalBilling: 1,
          pricing: 1,
          bookingFee: {
            $let: {
              vars: {
                pricingArray: {
                  $ifNull: ["$finalBilling.pricing", { $ifNull: ["$pricing", []] }],
                },
              },
              in: {
                $cond: {
                  if: {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$$pricingArray",
                            as: "item",
                            cond: { $eq: ["$$item.name", "Booking Fee"] },
                          },
                        },
                      },
                      0,
                    ],
                  },
                  then: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$$pricingArray",
                            as: "item",
                            cond: { $eq: ["$$item.name", "Booking Fee"] },
                          },
                        },
                        as: "fee",
                        in: {
                          $cond: {
                            if: {
                              $or: [
                                { $eq: ["$$fee.price", null] },
                                { $not: ["$$fee.price"] },
                              ],
                            },
                            then: 1.1,
                            else: { $toDouble: "$$fee.price" },
                          },
                        },
                      },
                    },
                  },
                  else: 1.01,
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalFare: { $sum: { $ifNull: ["$finalBilling.driverEarning.fare", 0] } },
          serviceFee: { $sum: { $ifNull: ["$finalBilling.driverEarning.serviceFee", 0] } },
          miscellaneous: { $sum: { $ifNull: ["$finalBilling.driverEarning.expenses", 0] } },
          userDiscount: { $sum: { $ifNull: ["$finalBilling.userBilling.discount", 0] } },
          tips: { $sum: { $ifNull: ["$finalBilling.driverEarning.tips", 0] } },
          onlineMileage: { $sum: { $ifNull: ["$finalBilling.km", 0] } },
          bookingFee: { $sum: "$bookingFee" },
          collectedHst: {
            $sum: { $ifNull: ["$finalBilling.userBilling.tax.taxTotal", 0] },
          },
          paidHst: {
            $sum: { $ifNull: ["$finalBilling.driverEarning.tax", 0] },
          },
        },
      },
    ]);

    const tripMileageCount = await rideBookingsModel.countDocuments({
      driver: user?._id,
      tripStatus: bookingStatus.completed,
      createdAt: {
        $gte: new Date(prevDate),
        $lte: new Date(nextDate),
      },
    });

    const formatValue = (value: any) => {
      return value === 0 ? "0.00" : parseFloat(value).toFixed(2);
    };

    const aggregateDriverData = await driversModel.aggregate([
      {
        $match: {
          _id: user?._id,
        },
      },
    ]);
    const totalFare = formatValue(aggregateData[0]?.totalFare || 0);
    const serviceFee = formatValue(aggregateData[0]?.serviceFee || 0);
    const bookingFee = formatValue(aggregateData[0]?.bookingFee || 0);
    const collectedHst = formatValue(aggregateData[0]?.collectedHst || 0);
    const paidHst = formatValue(aggregateData[0]?.paidHst || 0);
    const miscellaneous = formatValue(aggregateData[0]?.miscellaneous || 0);
    const userDiscount = formatValue(aggregateData[0]?.userDiscount || 0);
    const hstGst = aggregateDriverData[0]?.taxProfileForm?.hstGst || "";
    const tips = formatValue(aggregateData[0]?.tips || 0);
    const discount = formatValue(aggregateData[0]?.discount || 0);
    const onlineMileage = formatValue(aggregateData[0]?.onlineMileage || 0);
    const overallTotal =
      parseFloat(totalFare) +
      parseFloat(bookingFee) +
      parseFloat(collectedHst) +
      parseFloat(tips) -
      parseFloat(userDiscount);
    const total = overallTotal.toFixed(2);
    const breakDown =
      parseFloat(serviceFee) +
      parseFloat(bookingFee) +
      parseFloat(discount) +
      parseFloat(paidHst);
    const feesBreakdownTotal = breakDown.toFixed(2);
    const tripMileage = parseFloat(String(tripMileageCount * 2.3)).toFixed(2);
    const pdfData = {
      totalFare,
      serviceFee,
      bookingFee,
      collectedHst,
      miscellaneous,
      userDiscount,
      tips,
      total,
      feesBreakdownTotal,
      onlineMileage,
      discount,
      paidHst,
      tripMileage,
      hstGst,
    };
    const htmlContent = taxPdfFile({ user }, body, pdfData);
    const name = user.fullName.replace(/\s+/g, "_");
    const pdfMonth = body.month;
    const pdfYear = body.year;
    const fileName = generateUniquePdfFileName(name, pdfMonth, pdfYear);
    const pdfDirectory = path.join(__dirname, "pdfs");
    if (!fs.existsSync(pdfDirectory)) {
      fs.mkdirSync(pdfDirectory);
    }
    const pdfFilePath = path.join(pdfDirectory, fileName);

    const options = {
      format: "A4",
      orientation: "portrait",
      border: {
        top: "2cm",
        right: "1cm",
        bottom: "1mm",
        left: "1cm",
      },
    };

    try {
      const response: any = await generatePdfFile(
        htmlContent,
        pdfFilePath,
        options
      );
      const file = Bun.file(response.filename);
      const fileBuffer = await file.arrayBuffer();
      unlink(response.filename).catch((err: any) => { });
      return new Response(fileBuffer, {
        headers: {
          "Content-Type": "application/pdf",
        },
      });
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return error(400, { success: false, message: "PDF generation failed" });
    }
  } catch (e: any) {
    return error(500, { success: false, message: "Internal Server Error" });
  }
};
export const getDrivers = async ({ body, error }: any) => {
  try {
    const { driversId } = body;
    const drivers = await driversModel.find({ _id: { $in: driversId } });
    if (!drivers || drivers.length === 0) {
      return error(400, { success: false, message: "Driver not found" });
    }
    const formattedDrivers = drivers.map((item: any) => {
      return {
        _id: item?._id,
        fullName: item?.fullName,
        isBlocked: item?.isBlocked,
        uniqueID: item?.uniqueID,
        iAmBusy: item?.iAmBusy,
        iAmOnline: item?.iAmOnline,
        avatar: item?.avatar,
      };
    });
    return { success: true, data: formattedDrivers };
  } catch (e: any) {
    return error(500, { success: false, message: "Internal Server Error" });
  }
};
// export const onlineStatus = async ({ error, params, body }: any) => {
//   try {
//     const isAnyOtherActiveBooking = await rideBookingsModel.countDocuments({
//       $or: [
//         { "scheduled.scheduledAt": null },
//         {
//           $and: [
//             { "scheduled.scheduledAt": { $ne: null } },
//             { "scheduled.startRide": true },
//           ],
//         },
//       ],
//       driver: params.id,
//       tripStatus: { $in: ["picked", "ontheway", "arrived"] },
//       paymentStatus: true,
//     });
//     if (isAnyOtherActiveBooking > 0) {
//       return error(400, {
//         success: false,
//         data: null,
//         message: "Unable to offline",
//       });
//     }
//     let updatedDriverData = {
//       iAmOnline: body.status == "online" ? true : false,
//       socket_id: body.status !== "online" ? "" : undefined,
//       missedBookingCount: 0,
//       missedBookingAt: null,
//       stopFutureRide: false,
//     };
//     await driversModel.updateOne({ _id: params?.id }, updatedDriverData);
//     await activityLogsModel.create({
//       title: `Driver ${
//         body.status == "online" ? "Online" : "Offline"
//       } from app`,
//       description: `Driver ${
//         body.status == "online" ? "Online" : "Offline"
//       } from app by admin`,
//       driver: params.id,
//     });
//     return {
//       success: true,
//       message: body.status == "online" ? "Driver online" : " Driver offline",
//     };
//   } catch (e: any) {
//     logger.error({ error: e, msg: e.message });
//     return error(400, { success: false, data: null, message: "Server error" });
//   }
// };
export const onlineStatus = async ({ error, params, body }: any) => {
  try {
    const driver = await driversModel
      .findById(params.id)
      .select("vehicleInfo.isApproved");

    if (!driver) {
      return error(404, {
        success: false,
        data: null,
        message: "Driver not found",
      });
    }

    if (!driver?.vehicleInfo?.isApproved) {
      return error(400, {
        success: false,
        data: null,
        message: "Driver cannot go online because the account is not approved.",
      });
    }

    const isAnyOtherActiveBooking = await rideBookingsModel.countDocuments({
      $or: [
        { "scheduled.scheduledAt": null },
        {
          $and: [
            { "scheduled.scheduledAt": { $ne: null } },
            { "scheduled.startRide": true },
          ],
        },
      ],
      driver: params.id,
      tripStatus: { $in: ["picked", "ontheway", "arrived"] },
      paymentStatus: true,
    });

    if (isAnyOtherActiveBooking > 0) {
      return error(400, {
        success: false,
        data: null,
        message: "Unable to go offline while an active booking exists.",
      });
    }

    const updatedDriverData = {
      iAmOnline: body.status === "online",
      socket_id: body.status !== "online" ? "" : undefined,
      missedBookingCount: 0,
      missedBookingAt: null,
      stopFutureRide: false,
    };

    await driversModel.updateOne({ _id: params.id }, updatedDriverData);

    await activityLogsModel.create({
      title: `Driver ${body.status === "online" ? "Online" : "Offline"
        } from app`,
      description: `Driver ${body.status === "online" ? "Online" : "Offline"
        } from app by admin`,
      driver: params.id,
    });

    return {
      success: true,
      message: body.status === "online" ? "Driver online" : "Driver offline",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: null, message: "Server error" });
  }
};
export const documentVerificationAI = async ({ error, params, body }: any) => {
  try {
    const driver = await driversModel.findOne({ _id: params.id });
    if (!driver) {
      return error(400, { success: false, message: "Driver not found" });
    }

    switch (body.document) {
      case "driverLicense": {
        // console.log(body.document, "body.document enter");
        const data: any = {
          fullName: driver.fullName,
          dob: "1998-09-12",
          licenseNo: driver.vehicleInfo.licenseNo,
          licenseExpiryDate: moment(
            driver.vehicleInfo.licenseExpiryDate
          ).format("YYYY-MM-DD"),
          licenseImageUrl: driver.vehicleInfo.licensePhoto,
        };
        // console.log(data, "dataaa");
        const res = await axios.post(
          "http://192.168.29.41:8000/verify/license/",
          data,
          {
            headers: { "Content-Type": "application/json" },
            validateStatus: (status) => status < 500, // Accept 4xx responses
          }
        );
        // console.log("API Response Status:", res.status);
        // console.log("API Response Data:", JSON.stringify(res.data, null, 2));
        if (res.data?.success && res.data?.ai_approved === true) {
          await driversModel.updateOne(
            { _id: params.id },
            {
              $set: {
                "documents.$[doc].verifiedAI": true,
                "documents.$[doc].status": "pending",
              },
            },
            { arrayFilters: [{ "doc.docType": "driverLicense" }] }
          );
          return {
            success: true,
            message: "Driver license document verified successfully",
          };
        } else {
          await driversModel.updateOne(
            { _id: params.id },
            {
              $set: {
                "documents.$[doc].verifiedAI": false,
                "documents.$[doc].status": "pending",
                "documents.$[doc].rejectedReason":
                  res.data?.reason || "AI verification failed",
              },
            },
            { arrayFilters: [{ "doc.docType": "driverLicense" }] }
          );
          return {
            success: false,
            message: "Driver license document verification failed",
          };
        }
      }

      case "vehicleRegistration": {
        const vehicleData = {
          expiryDate: moment(driver.vehicleInfo.vehicleExpiryDate).format(
            "YYYY-MM-DD"
          ),
          serialNumber: driver.vehicleInfo.serialNo,
          driverLicense: driver.vehicleInfo.licenseNo,
          vehicleRegistrationUrl: driver.vehicleInfo.vehiclePhoto,
        };

        const res: any = await axios.post(
          "http://172.236.229.39:8001/verify/vehicle/",
          vehicleData,
          { headers: { "Content-Type": "application/json" } }
        );

        if (res.data?.success && res.data?.ai_approved === true) {
          await driversModel.updateOne(
            { _id: params.id },
            {
              $set: {
                "documents.$[doc].verifiedAI": true,
                "documents.$[doc].status": "pending",
              },
            },
            { arrayFilters: [{ "doc.docType": "vehicleRegistration" }] }
          );
          return {
            success: true,
            message: "Vehicle registration document verified successfully",
          };
        } else {
          await driversModel.updateOne(
            { _id: params.id },
            {
              $set: {
                "documents.$[doc].verifiedAI": false,
                "documents.$[doc].status": "pending",
                "documents.$[doc].rejectedReason":
                  res.data?.reason || "AI verification failed",
              },
            },
            { arrayFilters: [{ "doc.docType": "vehicleRegistration" }] }
          );
          return {
            success: false,
            message: "Vehicle registration document verification failed",
          };
        }
      }

      case "vehicleInsurance": {
        const insuranceData = {
          vehicleInsurancePolicyNo: driver.vehicleInfo.insurancePolicyNo,
          vehicleExpiryDate: moment(
            driver.vehicleInfo.insuranceExpiryDate
          ).format("YYYY-MM-DD"),
          vehicleInsurancePhoto: driver.vehicleInfo.insurancePhoto,
        };

        const res: any = await axios.post(
          "http://172.236.229.39:8001/verify/insurance/",
          insuranceData,
          { headers: { "Content-Type": "application/json" } }
        );
        if (res.data?.success && res.data?.ai_approved === true) {
          await driversModel.updateOne(
            { _id: params.id },
            {
              $set: {
                "documents.$[doc].verifiedAI": true,
                "documents.$[doc].status": "pending",
              },
            },
            { arrayFilters: [{ "doc.docType": "vehicleInsurance" }] }
          );
          return {
            success: true,
            message: "Vehicle insurance document verified successfully",
          };
        } else {
          await driversModel.updateOne(
            { _id: params.id },
            {
              $set: {
                "documents.$[doc].verifiedAI": false,
                "documents.$[doc].status": "pending",
                "documents.$[doc].rejectedReason":
                  res.data?.reason || "AI verification failed",
              },
            },
            { arrayFilters: [{ "doc.docType": "vehicleInsurance" }] }
          );
          return {
            success: false,
            message: "Vehicle insurance document verification failed",
          };
        }
        break;
      }

      case "workPermit": {
        // console.log("Handle work permit");
        break;
      }

      default:
        // console.log("Unknown document type");
        break;
    }
    return {
      success: true,
      message: "Document verified successfully",
      data: driver,
    };
  } catch (err) {
    return error(400, {
      success: false,
      message: "Something is wrong",
    });
  }
};
export const documentUpload = async ({ error, params, body }: any) => {
  try {
    const file = body.file;
    const documentType = body.documentType; // Key to identify which document to upload
    const driverId = params.id;

    if (!file) {
      return error(400, { success: false, message: "File is required" });
    }

    if (!documentType) {
      return error(400, {
        success: false,
        message: "Document type is required",
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const timestamp = Date.now();
    const fileExtension = file.name.split(".").pop() || "webp";
    const fileName = `${documentType}_${timestamp}.${fileExtension === "jpg" ? "webp" : fileExtension
      }`;
    const keykey = `websites/65f352b0d0b96c21405031be/drivers/${driverId}/${fileName}`;
    const wasabiEndpoint = new AWS.Endpoint(
      `s3.${process.env.AWS_REGION}.wasabisys.com`
    );
    const s3bucket = new AWS.S3({
      endpoint: wasabiEndpoint,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
    });

    let processedBuffer = buffer;
    let compressionInfo = null;

    if (file.type.startsWith("image/")) {
      const originalSize = buffer.length;

      if (
        file.type === "image/webp" ||
        file.name.toLowerCase().endsWith(".webp")
      ) {
        processedBuffer = buffer;
      } else {
        const resizeOptions =
          documentType === "avatar"
            ? { width: 300, height: 300 } // Smaller size for avatar
            : { width: 1024, height: 1024 }; // Standard size for documents

        processedBuffer = await sharp(buffer)
          .resize(resizeOptions)
          .webp({ quality: 85 })
          .toBuffer();

        const processedSize = processedBuffer.length;
        compressionInfo = {
          originalSize: (originalSize / 1024).toFixed(2) + " KB",
          processedSize: (processedSize / 1024).toFixed(2) + " KB",
          compressionRatio:
            (((originalSize - processedSize) / originalSize) * 100).toFixed(2) +
            "%",
        };
      }
    }

    // Upload parameters
    const uploadParams: any = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: keykey,
      Body: processedBuffer,
      ContentType: file.type.startsWith("image/") ? "image/webp" : file.type,
      ACL: "public-read",
    };

    // Upload to S3/Wasabi
    const uploadResult = await s3bucket.upload(uploadParams).promise();

    const fileUrl = `${process.env.AWS_Uploaded_File_URL_LINK}/${keykey}`;

    const updateField = documentType; // e.g. "vehicleInsurancePhoto"
    const updateQuery: any = {
      $set: {
        [`vehicleInfo.${updateField}`]: fileUrl, // ✅ computed key
        updatedAt: new Date(),
      },
    };
    // console.log(updateQuery, "sdgasdg");
    await driversModel.updateOne({ _id: driverId }, updateQuery);

    await activityLogsModel.create({
      title: `Document Uploaded by admin`,
      description: `${documentType} uploaded by admin`,
      driver: driverId,
    });

    return {
      success: true,
      // data: responseData,
      message: `${documentType} uploaded successfully`,
    };
  } catch (e: any) {
    // console.log("Document upload error:", e);
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      message: `Upload failed: ${e.message}`,
      documentType: body.documentType || "unknown",
    });
  }
};
export const colorChange = async ({ error, params, body }: any) => {
  try {
    const color = body.color;
    let updatedDriver = await driversModel.findOneAndUpdate(
      { _id: params.id },
      { $set: { "vehicleInfo.chooseColor": color } },
      { new: true } // returns the updated document
    );
    return {
      success: true,
      message: "Color updated successfully",
      data: updatedDriver,
    };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};
export const autoPayout = async ({ error, params }: any) => {
  try {
    payoutAllPendingDrivers();
    return {
      success: true,
      message: "Auto Payout updated successfully",
      data: "completed",
    };
  } catch (err) {
    return error(400, {
      success: false,
      message: "Something is wrong",
    });
  }
};
