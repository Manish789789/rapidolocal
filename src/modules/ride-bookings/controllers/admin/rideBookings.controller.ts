import { unlink } from "fs/promises";
import fs from "fs";
import { resources } from "@/utils/resources";
import model, { bookingStatus } from "../../models/rideBookings.model";
import { convertJson } from "@/utils/convertRides";
import { sendToDriverPushNotification } from "@/modules/drivers/controllers/admin/pushnotification.controller";
import { sendToCustomerPushNotification } from "@/modules/users/controllers/user-app/pushnotification.controller";
import usersModel from "@/modules/users/models/users.model";
import {
  cancelledPayment,
  capturePaymentIntent,
  refundAmountPaymentID,
} from "@/modules/paymentGateways/stripe.controller";
import { sendSocket } from "@/utils/websocket";
import driversWalletTransactionModel from "@/modules/drivers/models/driversWalletTransaction.model";
import driversModel from "@/modules/drivers/models/drivers.model";
import {
  handleSquareRefund,
  squareCancelPayment,
  squareCompletePayment,
} from "@/modules/paymentGateways/square.controller";
import { logger } from "@/utils/logger";
import {
  generatePdfFile,
  generateUniqueInvoiceName,
  invoicePdfFile,
} from "@/utils/invoicePdf";
import path from "path";
import rideBookingsModel from "../../models/rideBookings.model";
import { title } from "process";
import geoZonesModel from "@/modules/geo-zones/models/geoZones.model";
import {
  getDirections,
  getNearByDriverDetails,
  getNearByDrivers,
  getWeatherDetails,
} from "@/utils/map/mapboxHelper";
import vehicleTypeModel from "@/modules/drivers/models/vehicleType.model";
import couponsModel from "@/modules/coupons/models/coupons.model";
import { activeBookingsToActiveDrivers } from "../helpers/surge.controller";
import pricingForUserModel from "@/modules/pricing/models/pricingForUser.model";
import {
  calcVehiclePrice,
  getActiveBooking,
} from "../user-app/rideBookings.controller";
import { getRedis, redis } from "@/plugins/redis/redis.plugin";
import userWalletTransactionsModel from "@/modules/users/models/userWalletTransactions.model";
import { generateRandomNumbers } from "@/utils";
import {
  deleteBookingInRedis,
  getBookingFromRedis,
  getDriverFromRedis,
  getUserActiveBookingRedis,
  renameKeyInRedis,
  updateBookingInRedis,
} from "@/utils/redisHelper";
import {
  sendToDriverSocket,
  sendToUserSocket,
} from "@/plugins/websocket/websocket.plugin";

export const { index, create, update, deleteItem } = resources(model);

function calculateBillingFromVehicle(vehicle: any) {
  const pricing = vehicle.pricing || [];

  const fare = pricing.find((p: any) => p.name === "Fare")?.price || 0;
  const bookingFee =
    pricing.find((p: any) => p.name === "Booking Fee")?.price || 0;
  const operatingFee =
    pricing.find((p: any) => p.name === "Operating Fee")?.price || 0;
  const reservationPrice =
    pricing.find((p: any) => p.name === "Reservation Fee")?.price || 0;
  const surgeCharge =
    pricing.find((p: any) => p.name === "Surge Charge")?.price || 0;
  const tax = pricing.find((p: any) => p.name === "Tax")?.price || 0;
  const discount = pricing.find((p: any) => p.name === "Discount")?.price || 0;

  const taxPercentage = vehicle.tax?.percentage || 0;

  // User billing total
  const userBillingTotal =
    fare +
    bookingFee +
    operatingFee +
    reservationPrice +
    surgeCharge +
    tax -
    discount;

  let afterReservation = fare + reservationPrice;
  const serviceFee = afterReservation * 0.25;
  const taxOnServiceFee = serviceFee * 0.15;
  const subTotal = afterReservation - serviceFee - taxOnServiceFee;
  const driverTax = afterReservation * 0.15;
  const expenses = subTotal * 0.03;

  return {
    finalBilling: {
      driverEarning: {
        forReservationPrice: reservationPrice,
        fare: fare,
        serviceFee,
        otherEarning: 0,
        tax: taxOnServiceFee,
        driverTax,
        tips: 0,
        subTotal: subTotal,
        expenses,
        grandTotal: driverTax + subTotal - expenses,
      },
      userBilling: {
        total: fare + tax + vehicle.tip - discount,
        fare: fare,
        tax: tax,
        tip: vehicle.tip,
        disount: discount,
      },
      adminEarning: {
        grandtotal: fare + tax - discount,
      },
      pricing: vehicle.pricing,
      km: vehicle.km,
      kmText: vehicle.kmText,
      duration: vehicle.duration,
      durationText: vehicle.durationText,
    },
  };
}
function compareBilling(oldBilling: any, newBilling: any) {
  const changes: any = {};

  function compareObjects({ path, obj1, obj2 }: any) {
    const allKeys = new Set([
      ...Object.keys(obj1 || {}),
      ...Object.keys(obj2 || {}),
    ]);

    for (const key of allKeys) {
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (
        typeof val1 === "object" &&
        val1 !== null &&
        !Array.isArray(val1) &&
        typeof val2 === "object" &&
        val2 !== null &&
        !Array.isArray(val2)
      ) {
        compareObjects({ currentPath, val1, val2 });
      } else if (Array.isArray(val1) && Array.isArray(val2)) {
        if (JSON.stringify(val1) !== JSON.stringify(val2)) {
          changes[currentPath] = { old: val1, new: val2 };
        }
      } else if (val1 !== val2) {
        changes[currentPath] = { old: val1, new: val2 };
      }
    }
  }

  compareObjects({ obj1: oldBilling, obj2: newBilling });
  return changes;
}
export const getRidesCsv = async ({ error, body }: any) => {
  if (!body.filter) {
    return error(400, {
      success: false,
      data: {},
      message: "Please provide filter",
    });
  }
  try {
    const rides = await model
      .find(body.filter)
      .populate({
        path: "customer",
        select: "fullName",
      })
      .populate({
        path: "driver",
        select: "fullName",
      })
      .select(body.selectedField);
    const { fileUrl } = await convertJson(rides, body.selectedField);
    return { success: true, fileUrl, message: "Drivers successfully fetched" };
  } catch (err) {
    return error(400, {
      success: false,
      data: {},
      message: "Something is wrong",
    });
  }
};

export const tripStatusChange = async ({ error, params, body }: any) => {
  const redis: any = getRedis();
  const { id } = params;
  const { status, amount, driverAmount } = body;
  if (!id) {
    return error(400, {
      success: false,
      message: "Booking ID is required",
    });
  }
  const booking: any = await model.findById(id);
  const driverotherRide = await getUserActiveBookingRedis(booking.driver?._id);
  const user: any = await usersModel.findById(booking?.customer);
  const driver: any = await driversModel.findById(booking?.driver);
  if (!booking) {
    return error(404, {
      success: false,
      message: "Booking not found",
    });
  }
  if (status === "completed") {
    if (booking?.paymentIntentId.includes("pi_")) {
      try {
        await capturePaymentIntent(
          booking?.paymentIntentId,
          amount ? amount : 0
        );
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(500, {
          success: false,
          message: "Stripe capture failed",
          error: e.message,
        });
      }
    }
    if (
      booking?.paymentMethodId.includes("ccof:") ||
      booking?.paymentMethodId.includes("cnon:")
    ) {
      try {
        await squareCompletePayment(
          booking?.paymentIntentId,
          amount ? amount : null
        );
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(500, {
          success: false,
          message: "Square capture failed",
          error: e.message,
        });
      }
    }

    if (booking.paymentMethodId === "wallet") {
      try {
        await userWalletTransactionsModel.create({
          description: "On ride completion",
          amount: booking?.finalBilling?.userBilling?.totalAmount,
          trxType: "Debit",
          bookingId: booking._id,
          user: booking.customer,
          currency: {
            currencyCode: "USD",
            currencySymbol: "$",
          },
        });
        const user: any = await usersModel.findById(booking.customer);
        if (user?.wallet < 0) {
          return error(400, {
            success: false,
            message: "User wallet balance is less than 0",
          });
        }
        await usersModel.updateOne(
          { _id: booking.customer },
          {
            $inc: {
              wallet: -booking?.finalBilling?.userBilling?.totalAmount,
            },
          }
        );
      } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(500, {
          success: false,
          message: "Wallet capture failed",
          error: e.message,
        });
      }
    }

    await updateBookingInRedis(booking._id.toString(), {
      tripStatus: "completed",
      dropedAt: new Date(),
    });

    sendToUserSocket(booking.customer.toString(), {
      event: "singlebookingStatusUpdated",
      data: { bookingId: booking._id.toString() },
    });
    await driversWalletTransactionModel.create({
      description: "On ride completion",
      amount: booking?.finalBilling?.driverEarning?.grandTotal,
      trxType: "Credit",
      bookingId: booking._id,
      driver: booking.driver,
    });
    await driversModel.updateOne(
      { _id: booking.driver },
      {
        $inc: {
          wallet: +booking?.finalBilling?.driverEarning?.grandTotal,
        },
      }
    );
    if (driverotherRide.length > 0) {
      await driversModel.updateOne(
        { _id: booking.driver._id },
        { iAmBusy: true }
      );
    } else {
      await driversModel.updateOne(
        { _id: booking.driver._id },
        { iAmBusy: false }
      );
    }
    return {
      success: true,
      message: "Ride completed and driver earnings added",
    };
  }
  if (status === "cancelled") {
    try {
      try {
        if (driverAmount) {
          await driversWalletTransactionModel.create({
            description: "On ride cancellation",
            amount: driverAmount || 0,
            trxType: "Credit",
            bookingId: booking._id,
            driver: booking.driver,
          });
          await driversModel.updateOne(
            { _id: booking.driver },
            {
              $inc: {
                wallet: +driverAmount || 0,
              },
            }
          );
        }
        if (booking?.paymentMethodId?.includes("wallet")) {
          await usersModel.updateOne(
            { _id: booking.customer },
            {
              $inc: {
                wallet: -amount || 0,
              },
            }
          );
        }
        if (booking?.paymentIntentId.includes("pi_")) {
          if (amount) {
            await capturePaymentIntent(booking?.paymentIntentId, amount * 100);
          } else {
            await cancelledPayment(booking?.paymentIntentId);
          }
        } else if (booking?.paymentIntentId) {
        }
        if (
          booking?.paymentMethodId.includes("ccof:") ||
          booking?.paymentMethodId.includes("cnon:")
        ) {
          if (amount) {
            await squareCompletePayment(booking?.paymentIntentId, amount * 100);
          } else {
            await squareCancelPayment(booking?.paymentIntentId);
          }
        }
      } catch (paymentErr: any) {
        logger.error({ error: paymentErr, msg: paymentErr.message });
        return error(500, {
          success: false,
          message: "Error capturing payment before cancellation",
          error: paymentErr.message,
        });
      }

      try {
        sendToDriverPushNotification(booking.driver, {
          notification: {
            title: "Your ride booking has been cancelled .",
            body: "",
          },
          data: {
            notificationType: "cancelBooking",
            bookingId: booking._id.toString(),
          },
        });
      } catch (driverPushError: any) {
        logger.error({ error: driverPushError, msg: driverPushError.message });
      }

      try {
        sendToCustomerPushNotification(booking.customer, {
          notification: {
            title: "Your ride booking has been cancelled .",
            body: "",
          },
          data: {
            notificationType: "cancelBooking",
            bookingId: booking._id.toString(),
          },
        });
      } catch (customerPushError: any) {
        logger.error({
          error: customerPushError,
          msg: customerPushError.message,
        });
      }

      await updateBookingInRedis(booking._id.toString(), {
        tripStatus: "canceled",
        canceledBy: "admin",
        cancelledAt: new Date(),
        cancelReason: body?.cancelReason || "This ride is cancelled by admin",
      });
      await deleteBookingInRedis(booking._id.toString());

      if (driverotherRide.length > 0) {
        await driversModel.updateOne(
          { _id: booking.driver._id },
          { iAmBusy: true }
        );
      } else {
        await driversModel.updateOne(
          { _id: booking.driver._id },
          { iAmBusy: false }
        );
      }
      sendToUserSocket(booking.customer.toString(), {
        event: "singlebookingStatusUpdated",
        data: { bookingId: booking._id.toString() },
      });

      return {
        success: true,
        message: "Booking cancelled successfully",
      };
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return error(500, {
        success: false,
        message: "An error occurred while cancelling the booking",
        error: e.message,
      });
    }
  }
  if (
    [
      bookingStatus.ontheway,
      bookingStatus.picked,
      bookingStatus.arrived,
      bookingStatus.finding_driver,
    ].includes(status)
  ) {
    try {
      sendToDriverPushNotification(booking.driver, {
        notification: {
          title: `Your ride booking has been ${status}.`,
          body: "",
        },
        data: {
          notificationType: `${status}Booking`,
          bookingId: booking._id.toString(),
        },
      });
    } catch (driverPushError: any) {
      logger.error({ error: driverPushError, msg: driverPushError.message });
    }

    try {
      // Notify customer
      sendToCustomerPushNotification(booking.customer, {
        notification: {
          title: `Your ride booking has been ${status}.`,
          body: "",
        },
        data: {
          notificationType: `${status}Booking`,
          bookingId: booking._id.toString(),
        },
      });
    } catch (customerPushError: any) {
      logger.error({
        error: customerPushError,
        msg: customerPushError.message,
      });
    }

    // 🔔 Real-time update via sockets
    ["customer", "driver"].forEach((role) => {
      const id = booking[role]?.toString();
      if (id) {
        sendToUserSocket(id.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: booking._id.toString() },
        });
        sendToDriverSocket(id.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: booking._id.toString() },
        });
      }
    });

    if (status === "finding_driver") {
      await updateBookingInRedis(id, {
        tripStatus: status,
        isForce: !booking?.isForce ? body?.isForce ?? false : true,
        driver: null,
        acceptedAt: null,
        arrivedAt: null,
        pickedAt: null,
        dropedAt: null,
      });
      const oldKey = `booking:${booking._id}-${booking.customer._id}-${
        booking.driver ? booking.driver._id : "*"
      }`;
      await renameKeyInRedis(
        oldKey,
        `booking:${booking._id}-${booking.customer._id}-*`
      );
      if (driverotherRide.length > 0) {
        await driversModel.updateOne(
          { _id: booking.driver._id },
          { iAmBusy: true }
        );
      } else {
        await driversModel.updateOne(
          { _id: booking.driver._id },
          { iAmBusy: false }
        );
      }
    } else {
      const statusTimeFieldMap: Record<string, keyof typeof booking> = {
        accepted: "acceptedAt",
        arrived: "arrivedAt",
        picked: "pickedAt",
        dropped: "dropedAt",
      };
      const timeField = statusTimeFieldMap[status];
      if (status === bookingStatus.picked) {
        await updateBookingInRedis(id, {
          tripStatus: status,
          isForce: !booking?.isForce ? body?.isForce ?? false : true,
          ...(timeField
            ? { arrivedAt: new Date(), [timeField]: new Date() }
            : {}),
        });
      } else {
        await updateBookingInRedis(id, {
          tripStatus: status,
          isForce: !booking?.isForce ? body?.isForce ?? false : true,
          ...(timeField ? { [timeField]: new Date() } : {}),
        });
      }

      if (booking.driver) {
        await driversModel.updateOne(
          { _id: booking.driver._id },
          { iAmBusy: false }
        );
      }
      if (booking.driver) {
        await driversModel.updateOne(
          { _id: booking.driver._id },
          { iAmBusy: false }
        );
      }
    }
  }

  return {
    message: "Trip status changed successfully",
    success: true,
    data: "dfas",
  };
};
export const invoiceRideBooking = async ({
  request,
  body,
  error,
  params,
  response,
}: any) => {
  try {
    let orderDetails: any = await rideBookingsModel
      .findOne({ _id: body.bookingId })
      .lean();
    let isCancellationCharges =
      orderDetails?.tripStatus === "canceled" &&
      orderDetails?.finalBilling?.userBilling?.cancellationCharges > 0;

    const pickUp = orderDetails?.tripAddress[0];
    const dropOff =
      orderDetails?.tripAddress[orderDetails?.tripAddress.length - 1];
    const orderNo = orderDetails?.orderNo;

    const totalFare =
      orderDetails?.userBilling?.routeFare.toFixed(2) ||
      orderDetails?.finalBilling?.userBilling?.routeFare.toFixed(2);
    const tax =
      orderDetails?.userBilling?.tax?.taxTotal.toFixed(2) ||
      orderDetails?.finalBilling?.userBilling?.tax?.taxTotal.toFixed(2);
    const discount =
      orderDetails?.userBilling?.discount.toFixed(2) ||
      orderDetails?.finalBilling?.userBilling?.discount.toFixed(2);
    const tip =
      orderDetails.userBilling?.tip.toFixed(2) ||
      orderDetails?.finalBilling.userBilling?.tip.toFixed(2);
    const CancellationFee =
      orderDetails?.userBilling?.CancellationFee.toFixed(2) ||
      orderDetails?.finalBilling?.userBilling?.cancellationCharges.toFixed(2);
    const createdAt = orderDetails?.createdAt;
    const rideTime = orderDetails?.acceptedAt;
    const waitingCharges =
      (
        orderDetails?.userBilling?.extraCharges?.find(
          (charge: any) => charge.description === "Waiting Charges"
        )?.charges || 0
      ).toFixed(2) ||
      (
        orderDetails?.finalBilling?.userBilling?.extraCharges?.find(
          (charge: any) => charge.description === "Waiting Charges"
        )?.charges || 0
      ).toFixed(2);
    const surge =
      orderDetails?.selectedVehicle?.surgeValue > 1
        ? `${orderDetails?.selectedVehicle?.surgeCharge}`
        : 0;
    let totalWithTip = (
      parseFloat(totalFare) +
      parseFloat(tax) -
      parseFloat(discount) +
      parseFloat(tip) +
      parseFloat(waitingCharges)
    ).toFixed(2);
    let totalWithOutTip = (
      parseFloat(totalFare) +
      parseFloat(tax) -
      parseFloat(discount) +
      parseFloat(waitingCharges)
    ).toFixed(2);
    if (isCancellationCharges) {
      totalWithTip = parseFloat(
        orderDetails?.finalBilling?.userBilling?.totalAmount
      ).toFixed(2);
      totalWithOutTip = parseFloat(
        orderDetails?.finalBilling?.userBilling?.totalAmount
      ).toFixed(2);
    }
    const withTip = body.withTip;
    let pdfData;
    let htmlContent;
    if (isCancellationCharges) {
      pdfData = {
        CancellationFee,
        tax,
        withTip,
        pickUp,
        dropOff,
        orderNo,
        totalWithTip,
        totalWithOutTip,
        createdAt,
      };
      htmlContent = invoicePdfFile(pdfData, true);
    } else if (orderDetails?.tripStatus !== "canceled") {
      pdfData = {
        totalFare,
        tax,
        discount,
        tip,
        rideTime,
        pickUp,
        dropOff,
        orderNo,
        waitingCharges,
        surge,
        withTip,
        totalWithTip,
        totalWithOutTip,
        createdAt,
      };
      htmlContent = invoicePdfFile(pdfData, false);
    } else {
      pdfData = {
        totalFare: "0.00",
        tax: "0.00",
        discount: "0.00",
        tip: "0.00",
        rideTime,
        pickUp,
        dropOff,
        orderNo,
        waitingCharges: "0.00",
        surge,
        withTip: "0.00",
        totalWithTip: "0.00",
        totalWithOutTip: "0.00",
        createdAt,
      };
      htmlContent = invoicePdfFile(pdfData, false);
    }
    const fileName = generateUniqueInvoiceName(orderNo, orderNo);
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
      unlink(response.filename).catch((err) => {});
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
    return error(400, { success: false, message: "Internal Server Error" });
  }
};
export const refundWaitingCharges = async ({ error, params, body }: any) => {
  try {
    const booking: any = await rideBookingsModel.findById(params.id).lean();
    if (!booking) {
      return error(404, { success: false, message: "Booking not found" });
    }

    const waitingCharges =
      booking?.finalBilling?.userBilling?.extraCharges?.find(
        (charge: any) => charge.description === "Waiting Charges"
      );

    if (
      !waitingCharges ||
      !waitingCharges.charges ||
      waitingCharges.charges <= 0
    ) {
      return error(400, {
        success: false,
        message: "No refundable Waiting Charges found",
      });
    }

    const paymentmethod = booking?.paymentMethodId;
    const paymentId = booking?.waitingChargesIntent || "";
    const amount = waitingCharges.charges;

    let refundProcessed = false;

    if (body?.methode === "wallet") {
      await usersModel.updateOne(
        { _id: booking?.customer },
        { $inc: { wallet: amount } }
      );
      refundProcessed = true;
    } else if (paymentmethod === "wallet") {
      await usersModel.updateOne(
        { _id: booking?.customer },
        { $inc: { wallet: amount } }
      );
      refundProcessed = true;
    } else if (paymentId && paymentId.includes("pi_")) {
      const refund = await refundAmountPaymentID(paymentId, amount);
      if (!refund) {
        return error(502, { success: false, message: "Stripe refund failed" });
      }
      refundProcessed = true;
    } else if (
      paymentId &&
      (booking?.paymentMethodId.includes("ccof:") ||
        booking?.paymentMethodId.includes("cnon:"))
    ) {
      const refund = await handleSquareRefund(paymentId, amount);
      if (!refund) {
        return error(502, { success: false, message: "Square refund failed" });
      }
      refundProcessed = true;
    }

    if (!refundProcessed) {
      return error(400, {
        success: false,
        message: "Refund method not supported or paymentId missing",
      });
    }

    await rideBookingsModel.updateOne(
      { _id: params.id },
      {
        $inc: {
          "finalBilling.driverEarning.grandTotal": -amount,
          "finalBilling.userBilling.totalAmount": -amount,
        },
        $set: {
          "finalBilling.userBilling.extraCharges.$[charge].charges": 0,
        },
      },
      {
        arrayFilters: [{ "charge.description": "Waiting Charges" }],
      }
    );

    // Update driver transaction and wallet
    await driversWalletTransactionModel.updateOne(
      { bookingId: booking._id },
      { $inc: { amount: -amount } }
    );

    await driversModel.updateOne(
      { _id: booking?.driver },
      { $inc: { wallet: -amount } }
    );

    return {
      success: true,
      message: "Waiting Charges refunded successfully",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message || "Refund process failed" });
    return error(500, { success: false, message: "Internal Server Error" });
  }
};
export const refundCancelCharges = async ({ error, params, body }: any) => {
  try {
    const booking: any = await rideBookingsModel.findById(params.id).lean();
    if (!booking) {
      return error(404, { success: false, message: "Booking not found" });
    }
    const paymentmethod = booking?.paymentMethodId;
    const paymentId = booking?.paymentIntentId || "";
    const amount = booking?.finalBilling?.userBilling?.totalAmount;
    const amountDriver = booking?.finalBilling?.driverEarning?.grandTotal;
    let refundProcessed = false;
    if (body?.methode === "wallet") {
      await usersModel.updateOne(
        { _id: booking?.customer },
        { $inc: { wallet: amount } }
      );
      refundProcessed = true;
    } else if (paymentmethod === "wallet") {
      await usersModel.updateOne(
        { _id: booking?.customer },
        { $inc: { wallet: amount } }
      );
      refundProcessed = true;
    } else if (paymentId && paymentId.includes("pi_")) {
      const refund = await refundAmountPaymentID(paymentId, amount);
      if (!refund) {
        return error(502, { success: false, message: "Stripe refund failed" });
      }
      refundProcessed = true;
    } else if (
      paymentId &&
      (booking?.paymentMethodId.includes("ccof:") ||
        booking?.paymentMethodId.includes("cnon:"))
    ) {
      const refund = await handleSquareRefund(paymentId, amount);
      if (!refund) {
        return error(502, { success: false, message: "Square refund failed" });
      }
      refundProcessed = true;
    }

    if (!refundProcessed) {
      return error(400, {
        success: false,
        message: "Refund method not supported or paymentId missing",
      });
    }

    await rideBookingsModel.updateOne(
      { _id: params.id },
      {
        "finalBilling.userBilling.cancellationCharges": 0,
        "finalBilling.driverEarning.cancellationPrice": 0,
      }
    );

    await driversWalletTransactionModel.deleteOne({ bookingId: booking._id });

    await driversModel.updateOne(
      { _id: booking?.driver },
      { $inc: { wallet: -amountDriver } }
    );

    return {
      success: true,
      message: "Cancellation Charges refunded successfully",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message || "Refund process failed" });
    return error(500, { success: false, message: "Internal Server Error" });
  }
};

export const locationupdate = async ({ params, body, error }: any) => {
  try {
    const ride = await rideBookingsModel.findById(params.id).lean();
    if (!ride) {
      logger.error({ message: "Ride not found" });
      return error(400, { success: false, message: "Ride not found" });
    }

    const updateField = `tripAddress.${body.location.type}`;

    await rideBookingsModel.findByIdAndUpdate(
      params.id,
      {
        [updateField]: {
          title: body.location.address,
          address: body.location.address || "",
          location: {
            latitude: body.location.lat,
            longitude: body.location.lng,
          },
        },
      },
      { new: true }
    );
    return {
      success: true,
      message: "Location updated successfully",
      data: { location: body.location },
    };
  } catch (e: any) {
    logger.error({ message: e.message });
    return error(400, { success: false, message: "Internal Server Error" });
  }
};

export const calculateAdminVehiclePrice = async ({
  params,
  body,
  error,
}: any) => {
  try {
    // 1. Get booking details
    const booking = await rideBookingsModel
      .findById(params.id)
      .populate("vehicleType")
      .lean();

    if (!booking) {
      return error(404, { success: false, message: "Ride booking not found" });
    }

    // 2. Merge updates from admin into booking data
    const updatedAddress = body?.address || booking.tripAddress;
    // const updatedVehicle = body?.vehicleType || booking.selectedVehicle;
    const rideWhen = body?.rideWhen || "NOW";

    // Validate required data
    if (
      !updatedAddress ||
      !Array.isArray(updatedAddress) ||
      updatedAddress.length < 2
    ) {
      return error(400, {
        success: false,
        message: "Invalid address data - need at least 2 locations",
      });
    }
    for (const element of updatedAddress) {
      if (!element?.location?.longitude || !element?.location?.latitude) {
        return error(400, {
          success: false,
          message: "Invalid location coordinates in address",
        });
      }

      try {
        let availableZones = await geoZonesModel
          .findOne({
            location: {
              $geoIntersects: {
                $geometry: {
                  type: "Point",
                  coordinates: [
                    element.location.longitude,
                    element.location.latitude,
                  ],
                },
              },
            },
          })
          .lean();

        if (availableZones?.geoPoint?.coordinates?.length === 2) {
          element.location.longitude = availableZones.geoPoint.coordinates[0];
          element.location.latitude = availableZones.geoPoint.coordinates[1];
        }

        // Special case handling (same as calculatePrice)
        if (element.title === "50 Commonwealth Ave") {
          element.location.longitude = -52.805739;
          element.location.latitude = 47.5156912;
        }
      } catch (geoError) {}
    }

    const routes = await getDirections([...updatedAddress]);
    if (!routes || !routes[0] || !routes[0].legs) {
      return error(400, { success: false, message: "Route not available." });
    }

    let distance = routes[0]?.legs?.reduce(
      (prev: any, curr: any) => prev + (curr?.distance?.value || 0),
      0
    );

    let duration = routes[0]?.legs?.reduce(
      (prev: any, curr: any) => prev + (curr?.duration?.value || 0),
      0
    );

    // Same validation as calculatePrice
    if (distance < 50 && duration < 30) {
      return error(400, {
        success: false,
        message: "Pickup and drop-off location are too close",
      });
    }

    let tripDetails: any = {
      forDemo: false,
      km: parseFloat((distance / 1000).toFixed(1)),
      kmText: `${(distance / 1000).toFixed(1)} km`,
      durationText: `${Math.round(duration / 60)} mins`,
      duration: Math.round(duration / 60),
    };

    let userDetails = await usersModel
      .findById(booking?.customer)
      .select("rideCount")
      .lean();
    let countRides = userDetails?.rideCount || 0;

    if (typeof body?.coupon == "undefined") {
      if (countRides == 0) {
        let autoCoupon = await couponsModel.aggregate([
          {
            $match: {
              autoApply: true,
              validFor: "allUsers",
              status: true,
              $or: [
                {
                  userId: { $exists: true, $eq: booking?.customer }, // Changed from request?.user?._id
                },
                { userId: null },
              ],
            },
          },
          {
            $addFields: {
              remainingUsage: {
                $cond: {
                  if: { $ne: ["$userId", null] },
                  then: { $subtract: ["$usageLimit", "$usedCount"] },
                  else: null,
                },
              },
            },
          },
          {
            $match: {
              $or: [{ remainingUsage: { $gt: 0 } }, { remainingUsage: null }],
            },
          },
          {
            $sort: {
              createdAt: -1,
              validFor: 1,
            },
          },
          {
            $limit: 1,
          },
        ]);

        if (autoCoupon.length > 0) {
          tripDetails.coupon = {
            id: autoCoupon[0]._id,
            code: autoCoupon[0].code,
            discount: autoCoupon[0].discountAmount,
            discountType: autoCoupon[0].discountType,
            uptoAmount: autoCoupon[0].uptoAmount,
            isApplied: true,
          };
        }
      } else {
        let autoCoupon = await couponsModel
          .findOne({ autoApply: true, validFor: "allUsers", status: true })
          .sort({ createdAt: -1 });
        if (autoCoupon) {
          tripDetails.coupon = {
            id: autoCoupon._id,
            code: autoCoupon.code,
            discount: autoCoupon.discountAmount,
            discountType: autoCoupon.discountType,
            uptoAmount: autoCoupon.uptoAmount,
            isApplied: true,
          };
        }
      }
    }

    if (typeof body?.coupon != "undefined" && body.coupon.length != 0) {
      let couponDetails = await couponsModel.findOne({
        code: body?.coupon,
        validFor: "allUsers",
        status: true,
      });
      if (couponDetails) {
        tripDetails.coupon = {
          id: couponDetails._id,
          code: body?.coupon,
          discount: couponDetails.discountAmount,
          discountType: couponDetails.discountType,
          uptoAmount: couponDetails.uptoAmount,
          isApplied: true,
        };
      } else {
        tripDetails.coupon = {
          code: body?.coupon,
          discount: 0,
          discountType: "",
          isApplied: false,
        };
      }
    }

    // Handle new user coupons
    if (typeof body?.coupon == "undefined") {
      let autoCoupon = await couponsModel.aggregate([
        {
          $match: {
            autoApply: true,
            status: true,
            validFor: "newUsers",
            userId: booking?.customer, // Changed from request?.user?._id
            usageLimit: { $gte: 1 },
            expiredAt: { $gte: new Date() },
          },
        },
        {
          $addFields: {
            usageRemaining: { $subtract: ["$usageLimit", "$usedCount"] },
          },
        },
        {
          $match: {
            usageRemaining: { $gt: 0 },
          },
        },
        {
          $sort: {
            createdAt: -1,
            validFor: 1,
          },
        },
        {
          $limit: 1,
        },
      ]);
      if (autoCoupon.length > 0) {
        tripDetails.coupon = {
          id: autoCoupon[0]._id,
          code: autoCoupon[0].code,
          discount: autoCoupon[0].discountAmount,
          discountType: autoCoupon[0].discountType,
          uptoAmount: autoCoupon[0].uptoAmount,
          isApplied: true,
        };
      }
    }
    let vehicleToPrice = null;
    if (booking?.selectedVehicle) {
      vehicleToPrice = await vehicleTypeModel
        .findOne({ name: booking?.selectedVehicle?.name })
        .lean();
      if (!vehicleToPrice) {
        return error(400, { success: false, message: "Invalid vehicle type" });
      }
    }
    // 7. Get surge multipliers with error handling
    let getWeatherDetailsSurge;
    let activeBookingsToActiveDriversSurge;

    try {
      getWeatherDetailsSurge = await getWeatherDetails(
        updatedAddress[0].location.latitude,
        updatedAddress[0].location.longitude
      );
    } catch (weatherError) {
      getWeatherDetailsSurge = { underSurge: 0 };
    }

    try {
      activeBookingsToActiveDriversSurge = await activeBookingsToActiveDrivers(
        updatedAddress[0].location.latitude,
        updatedAddress[0].location.longitude
      );
    } catch (surgeError) {
      activeBookingsToActiveDriversSurge = { surgeMultiplier: 1 };
    }

    let netSurge =
      Number(
        Number(
          activeBookingsToActiveDriversSurge?.surgeMultiplier || 1
        ).toFixed(1)
      ) + Number(Number(getWeatherDetailsSurge?.underSurge || 0).toFixed(1));

    netSurge = Math.max(1, netSurge);
    const vehiclePrice = calcVehiclePrice(
      tripDetails,
      vehicleToPrice,
      updatedAddress.length - 2,
      rideWhen,
      netSurge,
      getWeatherDetailsSurge
    );
    const updatedVehicle = {
      ...vehiclePrice,
      tip: booking.tip,
    };
    const billing = calculateBillingFromVehicle(updatedVehicle);
    if (!vehiclePrice || typeof vehiclePrice.price === "undefined") {
      return error(400, {
        success: false,
        message: "Failed to calculate vehicle price",
      });
    }

    return {
      success: true,
      data: {
        billing,
      },
    };
  } catch (e) {
    return error(500, {
      success: false,
      message: "Error calculating price",
      details: process.env.NODE_ENV === "development" ? e : undefined,
    });
  }
};

export const updateAddress = async ({ params, body, error }: any) => {
  try {
    const booking: any = await rideBookingsModel.updateOne(
      { _id: params.id },
      {
        $set: {
          [`tripAddress.${body.index}`]: body.tripAddress,
        },
      }
    );
    console.log(body, "bookingbookingbooking");
    if (!booking) {
      logger.error({ message: "Address not found" });
      return error(400, { success: false, message: "Address not found" });
    }

    return {
      success: true,
      data: {
        address: booking?.tripAddress || [],
      },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      data: { message: e?.message || "Something is wrong." },
    });
  }
};

export const updateRideAddress = async ({ params, body, error }: any) => {
  try {
    const booking = await rideBookingsModel
      .findOne({ _id: body.bookingId })
      .lean();
    if (!booking) {
      logger.error({ message: "Booking not found" });
      return error(400, { success: false, message: "Booking not found" });
    }

    const updatedAddress = body?.address || booking.tripAddress;
    if (
      !updatedAddress ||
      !Array.isArray(updatedAddress) ||
      updatedAddress.length < 2
    ) {
      return error(400, {
        success: false,
        message: "Invalid address data - need at least 2 locations",
      });
    }

    for (const element of updatedAddress) {
      if (!element?.location?.longitude || !element?.location?.latitude) {
        return error(400, {
          success: false,
          message: "Invalid location coordinates in address",
        });
      }
    }

    await rideBookingsModel.findByIdAndUpdate(
      body.bookingId,
      { tripAddress: updatedAddress },
      { new: true }
    );

    return {
      success: true,
      message: "Ride address updated successfully",
      data: { address: updatedAddress },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Internal Server Error" });
  }
};

export const edit = async ({ params, error }: any) => {
  try {
    let redis = await getRedis();
    if (redis) {
      let bookingData: any = await getBookingFromRedis(params.id);
      if (bookingData) {
        return {
          success: true,
          message: "Booking fetched successfully (from cache)",
          data: bookingData,
        };
      }
    }

    const booking = await rideBookingsModel
      .findById(params.id)
      .populate(
        "driver customer rejectedDriver askDrivers askBusyDrivers vehicleType"
      )
      .lean();
    if (!booking) {
      return error(404, { success: false, message: "Booking not found" });
    }

    return {
      success: true,
      message: "Booking fetched successfully",
      data: booking,
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(500, { success: false, message: "Internal Server Error" });
  }
};

export const assignDriver = async ({ params, body, error }: any) => {
  try {
    const booking: any = await rideBookingsModel
      .findOne({ _id: params.id })
      .lean();

    if (!booking) {
      logger.error({ message: "Booking not found" });
      return error(400, { success: false, message: "Booking not found" });
    }

    const driverData: any = await getDriverFromRedis(body.driverId);
    if (!driverData?.length) {
      return error(400, {
        success: false,
        message: "Driver not found in Redis",
      });
    }

    if (driverData[0].iAmBusy || !driverData[0].iAmOnline) {
      logger.warn({
        msg: "Driver is not available",
        busy: driverData[0]?.iAmBusy,
        online: driverData[0]?.iAmOnline,
      });
      return error(400, { success: false, message: "Driver is not available" });
    }

    // 🔹 Check if booking already has a driver
    const bookingInRedis: any = await getBookingFromRedis(params.id);
    const alreadyAssignedDriver = bookingInRedis?.driver?._id
      ? bookingInRedis?.driver?._id
      : "*";

    if (alreadyAssignedDriver) {
      logger.info({
        msg: "Reassigning booking to new driver",
        oldDriver: alreadyAssignedDriver,
        newDriver: body.driverId,
      });

      // Notify old driver that booking is reassigned (optional)
      sendToDriverSocket(alreadyAssignedDriver.toString(), {
        event: "bookingReassigned",
        data: { bookingId: booking._id.toString() },
      });
    }

    // Notify customer + driver sockets
    sendToUserSocket(booking.customer.toString(), {
      event: "driverAssigned",
      data: {
        bookingId: booking._id.toString(),
        driverId: body.driverId,
      },
    });

    sendToDriverSocket(body.driverId.toString(), {
      event: "assigned",
      data: { bookingId: booking._id.toString() },
    });

    // Update Redis booking with new driver
    const driverDataDb = await driversModel.findById(body.driverId).lean();
    const userDb = await usersModel
      .findById(booking.customer.toString())
      .lean();

    await updateBookingInRedis(params.id, {
      driver: { ...driverDataDb, location: driverData[0].location },
      askDriver: {
        driver: null,
        expTime: null,
      },
      tripStatus: bookingStatus.ontheway,
      acceptedAt: new Date(),
      canceledByDriver: null,
      driverCanceledReason: null,
    });
    const oldKey = `booking:${params.id}-${String(booking?.customer?._id)}-${
      alreadyAssignedDriver || "*"
    }`;
    const newKey = `booking:${params.id}-${String(booking?.customer?._id)}-${
      body.driverId
    }`;
    await renameKeyInRedis(oldKey, newKey);
    await rideBookingsModel.updateOne(
      { _id: params.id },
      {
        $set: {
          driver: body.driverId,
          tripStatus: bookingStatus.ontheway,
          acceptedAt: new Date(),
        },
      }
    );
    await driversModel.updateOne(
      { _id: body.driverId },
      { iAmBusy: true, iAmOnline: true }
    );

    // Push notification to new driver
    try {
      sendToDriverPushNotification(body.driverId, {
        notification: {
          title: `Your booking has been assigned.`,
          body: "",
        },
        data: {
          notificationType: `AssignedBooking`,
          bookingId: booking._id.toString(),
        },
      });
    } catch (driverPushError: any) {
      logger.error({ error: driverPushError, msg: driverPushError.message });
    }
    return {
      success: true,
      message: alreadyAssignedDriver
        ? "Driver reassigned successfully"
        : "Driver assigned successfully",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Internal Server Error" });
  }
};
export const countRideBookingDetails = async ({ error, body }: any) => {
  try {
    // 🧩 Build the filter dynamically
    const filter: any =
      body?.filter && Object.keys(body.filter).length > 0
        ? {
            ...body.filter,
            ...(body.filter.createdAt && {
              createdAt: {
                ...(body.filter.createdAt.$gte
                  ? { $gte: new Date(body.filter.createdAt.$gte) }
                  : {}),
                ...(body.filter.createdAt.$lt
                  ? { $lt: new Date(body.filter.createdAt.$lt) }
                  : {}),
              },
            }),
          }
        : {};

    // 🧠 Aggregation pipeline
    const result = await rideBookingsModel.aggregate([
      { $match: filter },

      {
        $facet: {
          // 📊 Count rides by payment method
          paymentMethods: [
            {
              $group: {
                _id: {
                  $cond: [
                    { $eq: ["$paymentMethod", "wallet"] },
                    "wallet",
                    {
                      $cond: [
                        {
                          $regexMatch: {
                            input: "$paymentMethodId",
                            regex: /^pi_|^pm_/,
                          },
                        },
                        "stripe",
                        {
                          $cond: [
                            {
                              $regexMatch: {
                                input: "$paymentMethodId",
                                regex: /^ccof:|^cnon:|^cfof:/,
                              },
                            },
                            "square",
                            "Wallet",
                          ],
                        },
                      ],
                    },
                  ],
                },
                count: { $sum: 1 },
              },
            },
          ],

          // 🚗 Count rides by trip status
          tripStatuses: [
            {
              $group: {
                _id: "$tripStatus",
                count: { $sum: 1 },
              },
            },
          ],

          // 🧾 Total ride count
          total: [
            {
              $count: "count",
            },
          ],
        },
      },
    ]);

    // 🧩 Format the result
    const data = {
      paymentMethods: result[0]?.paymentMethods || [],
      tripStatuses: result[0]?.tripStatuses || [],
      totalRides: result[0]?.total?.[0]?.count || 0,
    };

    return { success: true, data };
  } catch (err: any) {
    console.log("Error counting ride bookings:", err);
    return { success: false, message: err.message };
  }
};
