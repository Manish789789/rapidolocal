import { pagination, resources } from "@/utils/resources";
import driversModel from "@/modules/drivers/models/drivers.model";
import {
  getDirections,
  getDirectionsDistanceTime,
  getDirectionsWithoutMapbox,
  getNearByDriverDetails,
  getNearByDrivers,
  getWeatherDetails,
} from "@/utils/map/mapboxHelper";
import vehicleTypeModel from "@/modules/drivers/models/vehicleType.model";
import rideBookingsModel, {
  bookingStatus,
} from "../../models/rideBookings.model";
import couponsModel from "@/modules/coupons/models/coupons.model";
import {
  activeBookingsToActiveDrivers,
  surgeCompleteProcessForSingleZone,
} from "../helpers/surge.controller";
import moment from "moment";
import { sendToCustomerPushNotification } from "@/modules/users/controllers/user-app/pushnotification.controller";
import { sendToDriverPushNotification } from "@/modules/drivers/controllers/admin/pushnotification.controller";
import { logger } from "@/utils/logger";
import paymentMethodsModel from "@/modules/users/models/paymentMethods.model";
import {
  attachPaymentMethod,
  cancelledPayment,
  capturePaymentIntent,
  createPaymentintent,
} from "@/modules/paymentGateways/stripe.controller";
import geoZonesModel from "@/modules/geo-zones/models/geoZones.model";
import {
  createSquarePayment,
  squareCancelPayment,
  squareCompletePayment,
} from "@/modules/paymentGateways/square.controller";
import mongoose from "mongoose";
import { setUpForVoiceCall } from "@/utils/callAgora";
import {
  generatePdfFile,
  generateUniqueInvoiceName,
  invoicePdfFile,
} from "@/utils/invoicePdf";
import fs from "fs";
import path from "path";
import usersModel from "@/modules/users/models/users.model";
import driversWalletTransactionModel from "@/modules/drivers/models/driversWalletTransaction.model";
import { sosCallNotification } from "@/utils/emails/email.handler";
import bookingChatModel from "../../models/bookingChatModel";
import { unlink } from "fs/promises";
import { surgeUpdated } from "@/utils/fetchSocketId";
import { sendSocket, sendToAllUsers } from "@/utils/websocket";
import pricingForUserModel from "@/modules/pricing/models/pricingForUser.model";
import {
  deleteMatchNotification,
  getActiveBookingCountFromRedis,
  getBookingFromRedis,
  getDriverFromRedis,
  getNearbyDriversRedis,
  getSecondActiveBookingFromRedis,
  getUserActiveBookingRedis,
  saveBookingInRedis,
  updateBookingInRedis,
} from "@/utils/redisHelper";
import {
  cancellatinChargesApplyAfterJobCancelByCustomer,
  cancellatinChargesApplyAfterJobPickedByDriverButNotArriving,
  jobSendByRedis,
  TEN_SECONDS
} from "@/utils/constant";
import {
  sendToDriverSocket,
  sendToUserSocket,
} from "@/plugins/websocket/websocket.plugin";
import { findNearDriverFromRedis } from "@/modules/drivers/controllers/admin/cronRedis.controller";
import { findNearDriver } from "@/modules/drivers/controllers/admin/cron.controller";
import userWalletTransactionsModel from "@/modules/users/models/userWalletTransactions.model";
import { generateRandomNumbers } from "@/utils";
import activityLogsModel from "@/modules/activityLogs/models/activityLogs.model";

export const { index, create, edit, update, deleteItem } =
  resources(rideBookingsModel);

export const getActiveBooking = async ({ request, error }: any) => {
  try {
    let data: any = {};
    if (jobSendByRedis) {
      data = await getUserActiveBookingRedis(request?.user?._id);
    } else {
      data = await rideBookingsModel
        .findOne({
          customer: request?.user?._id,
          tripStatus: {
            $nin: [bookingStatus.canceled, bookingStatus.completed],
          },
          paymentStatus: true,
          $or: [
            { "scheduled.scheduledAt": null },
            {
              $and: [
                { "scheduled.scheduledAt": { $ne: null } },
                { "scheduled.startRide": true },
              ],
            },
          ],
        })
        .populate("driver vehicleType")
        .select("-rejectedDriver")
        .lean();
    }

    return { success: true, data };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: {}, message: "0 booking" });
  }
};

export const nearByCars = async ({ request, body, error }: any) => {
  try {
    let origin = body.address.shift();
    if (jobSendByRedis) {
      let cars = await getNearbyDriversRedis(origin.location, 30000);
      return { success: true, data: cars };
    }

    let cars = await driversModel
      .aggregate([
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [
                origin.location.longitude,
                origin.location.latitude,
              ],
            },
            distanceField: "distance",
            maxDistance: 30000,
            spherical: true,
          },
        },
        {
          $match: {
            "vehicleInfo.isApproved": true,
            iAmOnline: true,
            iAmBusy: { $in: [true, false] },
          },
        },
        {
          $sort: {
            distance: 1,
            iAmOnline: 1,
          },
        },
        { $limit: 10 },
      ])
      .catch((err) => {
        return [];
      });
    cars = cars
      ?.filter(
        (item) =>
          item?.location?.coordinates && item?.location?.coordinates != 0
      )
      .map((item) => {
        return {
          driverId: item?._id,
          heading: item.heading,
          lat: item?.location?.coordinates[1],
          long: item?.location?.coordinates[0],
        };
      });

    return { success: true, data: cars };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "0 cars" });
  }
};

export const checkLastActiveBooking = async ({ request, body, error }: any) => {
  try {
    let data: any = await rideBookingsModel
      .findOne({
        customer: request?.user?._id,
        tripStatus: { $in: [bookingStatus.completed] },
        paymentStatus: true,
        $or: [
          { "driverRating.stars": null },
          {
            "finalBilling.pricing": {
              $not: { $elemMatch: { name: "Tip" } },
            },
          },
        ],
        createdAt: {
          $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
          $lte: new Date(),
        },
      })
      .sort({ createdAt: -1 })
      .populate("driver vehicleType")
      .select("-rejectedDriver")
      .lean();
    if (data) {
      const hasTip = data?.finalBilling?.pricing?.some(
        (item: any) => item.name === "Tip"
      );
      const hasStars = data?.driverRating?.stars;
      if (!hasTip && hasStars) {
        data = { ...data, goToScreen: "driver_tip" };
      } else if (hasTip && !hasStars) {
        data = { ...data, goToScreen: "driver_rating" };
      } else {
        data = { ...data, goToScreen: "both" };
      }
    }
    return { success: true, data: data };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "0 booking" });
  }
};

export const calculatePrice = async ({ request, body, error }: any) => {
  const countries = ["Canada"];
  const cities = ["St. John's", "Bay Roberts"];

  try {
    // console.log("Requested Body")
    for (const element of body?.address) {
      let availableZones = await geoZonesModel
        .findOne({
          location: {
            $geoIntersects: {
              $geometry: {
                type: "Point",
                coordinates: [
                  element?.location?.longitude,
                  element?.location?.latitude,
                ],
              },
            },
          },
        })
        .lean();
      if (availableZones?.geoPoint?.coordinates?.length === 2) {
        element.location.longitude = availableZones?.geoPoint?.coordinates[0];
        element.location.latitude = availableZones?.geoPoint?.coordinates[1];
      }
      if (element.title === "50 Commonwealth Ave") {
        element.location.longitude = -52.805739;
        element.location.latitude = 47.5156912;
      }
    }

    const routes = await getDirections([...body.address]);
    // const routes = await getDirectionsWithoutMapbox([...body.address]);
    if (!routes) {
      return error(400, { success: false, message: "Route not available." });
    }

    const cars = await getNearByDrivers([...body.address]);

    let distance: any = routes[0]?.legs?.reduce(
      (prev: any, curr: any) => prev + curr.distance.value,
      0
    );
    let duration: any = routes[0]?.legs?.reduce(
      (prev: any, curr: any) => prev + curr.duration.value,
      0
    );
    if (distance < 50 && duration < 30) {
      return error(400, {
        success: false,
        message: "Pickup and drop-off location are too close",
      });
    }
    const firstDriverDetails = await getNearByDriverDetails(body.address);

    let tripDetails: any = {
      forDemo: false,
      // firstRide: `You will get 25% cashback in your wallet`,
      km: parseFloat((distance / 1000).toFixed(1)),
      kmText: `${(distance / 1000).toFixed(1)} km`,
      durationText: `${Math.round(duration / 60)} mins`,
      duration: Math.round(duration / 60),
      firstDriverDetails,
      cars: cars
        ?.filter(
          (item) =>
            item?.location?.coordinates && item?.location?.coordinates != 0
        )
        .map((item) => {
          return {
            heading: item.heading,
            lat: item?.location?.coordinates[1],
            long: item?.location?.coordinates[0],
          };
        }),
    };

    let vehicles = await vehicleTypeModel.find().sort({ priority: 1 }).lean();
    tripDetails.vehicles = [];
    let countRides = request?.user?.rideCount || 0;

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
                  userId: { $exists: true, $eq: request?.user?._id },
                  //here
                },
                { userId: null },
              ],
            },
          },
          {
            // Add a field to calculate remaining usage if userId is not null
            $addFields: {
              remainingUsage: {
                $cond: {
                  if: { $ne: ["$userId", null] }, // If userId is not null
                  then: { $subtract: ["$usageLimit", "$usedCount"] }, // Calculate remaining usage
                  else: null,
                },
              },
            },
          },
          {
            // Optionally add a $match to check the remaining usage
            $match: {
              $or: [
                { remainingUsage: { $gt: 0 } }, // Ensure remaining usage is greater than 0 if calculated
                { remainingUsage: null }, // Keep coupons where userId is null
              ],
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
          .findOne({
            autoApply: true,
            validFor: "allUsers",
            status: true,
            expiredAt: { $gte: new Date() },
          })
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
        $or: [{ expiredAt: { $gte: new Date() } }],
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

    if (typeof body?.coupon == "undefined") {
      let autoCoupon = await couponsModel.aggregate([
        {
          $match: {
            autoApply: true,
            status: true,
            validFor: "newUsers",
            userId: request?.user?._id,
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

    let getWeatherDetailsSurge = await getWeatherDetails(
      body?.address[0].location.latitude,
      body?.address[0].location.longitude
    );
    let activeBookingsToActiveDriversSurge =
      await activeBookingsToActiveDrivers(
        body?.address[0].location.latitude,
        body?.address[0].location.longitude
      );
    let netSurge =
      Number(
        Number(
          activeBookingsToActiveDriversSurge?.surgeMultiplier || 1
        ).toFixed(1)
      ) + Number(Number(getWeatherDetailsSurge?.underSurge?.toFixed(1)));

    for (let vehicle of vehicles) {
      let firstCar =
        cars.filter(
          (res) =>
            typeof res?.vehicleType != "undefined" &&
            res?.vehicleType.length != 0 &&
            res?.vehicleType?.toString() == vehicle._id.toString()
        ) || [];
      tripDetails.vehicles.push({
        ...calcVehiclePrice(
          tripDetails,
          vehicle,
          body?.address?.length - 2,
          body?.rideWhen,
          netSurge,
          getWeatherDetailsSurge
        ),
        carDuration: parseFloat(
          ((firstCar?.[0]?.distance || 0) / 1000).toFixed(2)
        ),
        isAvailable: firstCar.length != 0,
      });
    }

    for (let i = 0; i < tripDetails.vehicles.length; i++) {
      const vehicle = tripDetails.vehicles[i];
      const createdData = await pricingForUserModel.create({
        customer: request?.user?._id,
        vehicleType: vehicle,
      });

      tripDetails.vehicles[i] = {
        ...vehicle,
        pricingModalId: createdData._id,
      };
    }
    return { success: true, data: tripDetails };
  } catch (e) {
    return error(400, { success: false, message: `Route not available` });
  }
};

export const mybookings = async ({ request, body, error }: any) => {
  try {
    if (body.isScheduled) {
      body = {
        ...body,
        filter: {
          ...body.filter,
          customer: request?.user?._id,
          paymentStatus: true,
          "scheduled.isScheduled": true,
          "scheduled.scheduledAt": { $not: { $eq: null } },
        },
      };
    } else {
      body = {
        ...body,
        filter: {
          ...body.filter,
          customer: request?.user?._id,
          paymentStatus: true,
          $or: [
            { "scheduled.isScheduled": false },
            {
              $and: [
                { "scheduled.isScheduled": false },
                { "scheduled.scheduledAt": null },
              ],
            },
            {
              "scheduled.isScheduled": null,
            },
          ],
        },
      };
    }
    return { success: true, data: await pagination(body, rideBookingsModel) };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: `0 cars` });
  }
};

function calculateDiscount(
  originalAmount: any,
  discountType: any,
  discountValue: any,
  cap: any
) {
  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = (originalAmount * discountValue) / 100;
  } else if (discountType === "flat") {
    discountAmount = discountValue;
  } else {
    throw new Error('Invalid discount type. Use "percentage" or "flat".');
  }
  if (cap && discountAmount > cap) {
    discountAmount = cap;
  }
  const finalAmount = originalAmount - discountAmount;
  return Math.max(finalAmount, 0);
}

export const calcVehiclePrice = (
  tripDetails: any,
  vehicle: any,
  noOfStopPoints = 0,
  rideWhen = "NOW",
  surgeValue = 1,
  weatherSurge: any
) => {
  let stopPointCharges = 0;
  if (noOfStopPoints > 0) {
    stopPointCharges = 2 * noOfStopPoints;
  }
  let perTime = tripDetails.duration * vehicle.perMinPricing;
  // (base fare + km + time ) + 10% booking fee min 1$ max 5$
  let vehiclePrice =
    Math.max(
      vehicle.basePrice + vehicle.perKmPricing * tripDetails.km + perTime,
      vehicle.minimumFare
    ) +
    stopPointCharges +
    Number(Number(Math.random() * 0.2).toFixed(2));
  // console.log(vehicle.basePrice, vehicle.perKmPricing, tripDetails.km, perTime, vehicle.minimumFare, 'vehiclePrice**')
  // console.log(vehiclePrice,'vehiclePrice before surge**')

  let surgeCharge = 0;
  if (surgeValue > 1.2) {
    surgeCharge = Number(Number(vehiclePrice * (surgeValue - 1)).toFixed(2));
  }

  let forReservationPrice = {
    price: 0,
    tax: 0,
  };

  if (rideWhen === "LATER") {
    forReservationPrice.price = 3;
    forReservationPrice.tax = forReservationPrice.price * 0.15;
  }

  let bookingFee = Math.min(Math.max(vehiclePrice * 0.1, 1), 5);
  let operatingFee = vehiclePrice * 0.01;
  let totalPrice =
    vehiclePrice +
    bookingFee +
    operatingFee +
    forReservationPrice.price +
    surgeCharge;
  let tax = totalPrice * 0.15;

  // console.log(totalPrice,'totalPrice**')
  // console.log(vehiclePrice,'vehiclePrice**')
  // console.log(bookingFee,'bookingFee**')
  // console.log(operatingFee,'operatingFee**')
  // console.log(forReservationPrice.price,'forReservationPrice.price**')
  // console.log(surgeCharge,'surgeCharge**')
  // console.log(tax, 'tax**', totalPrice)

  let vehicleDiscountedPrice = totalPrice + tax;
  // console.log(vehicleDiscountedPrice, 'vehicleDiscountedPrice**')
  // console.log(vehiclePrice, 'vehiclePrice**')
  if (
    typeof tripDetails?.coupon != "undefined" &&
    tripDetails.coupon.isApplied
  ) {
    vehicleDiscountedPrice = calculateDiscount(
      vehiclePrice,
      tripDetails?.coupon.discountType,
      tripDetails?.coupon.discount,
      tripDetails?.coupon.uptoAmount
    );
    if (rideWhen === "LATER") {
      forReservationPrice.price = 3;
      forReservationPrice.tax = forReservationPrice.price * 0.15;
    }
    let newTotalPrice =
      vehicleDiscountedPrice +
      bookingFee +
      operatingFee +
      forReservationPrice.price +
      surgeCharge;
    tax = newTotalPrice * 0.15;
    // console.log(newTotalPrice, 'newTotalPrice**', vehicleDiscountedPrice)
    vehicleDiscountedPrice = newTotalPrice + tax;
    // console.log(vehicleDiscountedPrice, 'vehicleDiscountedPrice after**', newTotalPrice, tax)
  }

  let pricing = [
    { name: "Fare", price: parseFloat(vehiclePrice?.toFixed(2)) },
    { name: "Booking Fee", price: parseFloat(bookingFee?.toFixed(2)) },
    { name: "Operating Fee", price: parseFloat(operatingFee?.toFixed(2)) },
    {
      name: "Reservation Fee",
      price: parseFloat(forReservationPrice?.price?.toFixed(2)),
    },
    { name: "Surge Charge", price: parseFloat(surgeCharge?.toFixed(2)) },
    { name: "Tax", price: parseFloat(tax?.toFixed(2)) },
  ];

  // console.log(pricing,'pricing**')

  if (
    typeof tripDetails?.coupon != "undefined" &&
    tripDetails.coupon.isApplied
  ) {
    pricing.push({
      name: "Discount",
      price: totalPrice + tax - vehicleDiscountedPrice,
    });
  }
  return {
    _id: vehicle._id,
    name: vehicle.name,
    icon: vehicle.icon,
    seats: vehicle.seats,
    status: vehicle.status,
    surgeCharge: surgeCharge,
    surgeValue: surgeValue,
    weatherSurge,
    vehiclePrice: parseFloat(vehiclePrice?.toFixed(2)),
    subTotal: parseFloat(totalPrice?.toFixed(2)),
    price: parseFloat((totalPrice + tax)?.toFixed(2)),
    operatingFee: parseFloat(operatingFee?.toFixed(2)),
    bookingFee: parseFloat(bookingFee?.toFixed(2)),
    discount: vehicleDiscountedPrice,
    forReservationPrice,
    pricing,
    tax: {
      percentage: 15,
      taxTotal: parseFloat(tax?.toFixed(2)),
    },
    discountObject: {
      ...tripDetails.coupon,
    },
    km: tripDetails.km,
    kmText: tripDetails.kmText,
    durationText: tripDetails.durationText,
    duration: tripDetails.duration,
  };
};

export const placeAndConfirmOrder = async (
  request: any,
  body: any,
  grandTotal: any,
  discountedTotal: any,
  defaultPaymet: any,
  status: any,
  paymentStep: any
) => {
  // console.log('place an confirm order**')
  const randomFourDigit = Math.floor(1000 + Math.random() * 9000);
  const timestamp = Date.now();
  const bookingFee = parseFloat(body?.selectedVehicle?.bookingFee || "0");
  let fare = parseFloat(body.selectedVehicle.subTotal) - bookingFee;
  let reservationPrice = 0;
  if (body.rideWhen === "LATER") {
    fare = fare - parseFloat(body?.selectedVehicle?.forReservationPrice?.price);
    reservationPrice = 1.5;
  }
  let byAdminSurgeCharge = 0;
  let byAdminSurgeChargeTax = 0;
  if (
    body?.selectedVehicle?.surgeValue > 1 &&
    body?.selectedVehicle?.surgeValue <= 1.2
  ) {
    byAdminSurgeCharge = Number(
      Number(
        body?.selectedVehicle?.vehiclePrice *
        (body?.selectedVehicle?.surgeValue - 1)
      ).toFixed(2)
    );
    byAdminSurgeChargeTax = byAdminSurgeCharge * 0.15;
  }
  fare = fare + byAdminSurgeCharge + byAdminSurgeChargeTax;
  let afterReservation = fare + reservationPrice;
  const serviceFee = afterReservation * 0.25;
  const taxOnServiceFee = serviceFee * 0.15;
  const subTotal = afterReservation - serviceFee - taxOnServiceFee;
  const driverTax = afterReservation * 0.15;
  const expenses = subTotal * 0.03;
  const otp = Math.floor(1000 + Math.random() * 9000);

  // console.log(reservationPrice, 'reservationPrice**-')
  // console.log(fare, 'fare**-')
  // console.log(serviceFee, 'serviceFee**-')
  // console.log(subTotal, 'subTotal**-')
  // console.log(driverTax, 'driverTax**-')
  // console.log(taxOnServiceFee, 'taxOnServiceFee**-')
  // console.log(afterReservation, 'afterReservation**-')

  let userBilling = {
    routeFare: body.selectedVehicle.subTotal,
    tax: {
      percentage: body.selectedVehicle.tax.percentage,
      taxTotal: body.selectedVehicle.tax.taxTotal,
    },
    tip: 0,
    extraCharges: [],
    discount:
      discountedTotal == 0
        ? body.selectedVehicle.price
        : parseFloat(
          (
            body.selectedVehicle.price - body?.selectedVehicle?.discount || 0
          )?.toFixed(2)
        ),
    totalAmount: grandTotal,
  };

  delete body.selectedVehicle._id;
  delete body._id;

  let latLongArray = body.tripAddress.map((element: any) => {
    return {
      location: {
        type: "Point",
        coordinates: [element.location.longitude, element.location.latitude],
      },
    };
  });

  let collectOrder: any = {
    ...body,
    ...body.selectedVehicle,
    grandTotal: grandTotal,
    orderNo: String(timestamp) + String(randomFourDigit),
    customer: request?.user?._id,
    paymentStatus: status,
    tripStatus: bookingStatus.finding_driver,
    paymentStep: paymentStep,
    paymentMethodId:
      defaultPaymet == "wallet"
        ? defaultPaymet
        : defaultPaymet?.methodId
          ? defaultPaymet?.methodId
          : defaultPaymet?.squareMethodId
            ? defaultPaymet?.squareMethodId
            : "",
    rejectedDriver: request?.user?.blockDrivers,
    expectedBilling: {
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
      userBilling,
      pricing: body.selectedVehicle.pricing,
      km: body.selectedVehicle.km,
      kmText: body.selectedVehicle.kmText,
      duration: body.selectedVehicle.duration,
      durationText: body.selectedVehicle.durationText,
    },
    finalBilling: {
      userBilling,
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
      pricing: body.selectedVehicle.pricing,
      km: body.selectedVehicle.km,
      kmText: body.selectedVehicle.kmText,
      duration: body.selectedVehicle.duration,
      durationText: body.selectedVehicle.durationText,
    },
    coupon: body?.selectedVehicle?.discountObject?.id,
    firstTripAddressGeoLocation: latLongArray[0].location,
    otp,
    selectedVehicle: {
      ...body?.selectedVehicle,
      pricingModalId: body?.pricingModalId,
    },
    country: {
      name: "canada",
      countryCode: "1",
      currencyCode: "CAD",
      currencySymbol: "$",
    },
  };

  if (body.rideWhen === "LATER") {
    collectOrder = {
      ...collectOrder,
      scheduled: {
        isScheduled: true,
        scheduledAt: body.date_time,
      },
    };
  }

  let newOrder = await rideBookingsModel.create({ ...collectOrder });
  let orderDetail = await rideBookingsModel
    .findById(newOrder._id)
    .populate("customer")
    .lean();

  return orderDetail;
};

export const afterPlaceBooking = async (orderDetail: any) => {
  if (
    orderDetail.tripStatus === bookingStatus.finding_driver &&
    orderDetail.paymentStatus === true
  ) {
    let customerId = orderDetail?.customer?._id
      ? orderDetail.customer._id
      : orderDetail.customer;
    let orderId = orderDetail._id;
    await saveBookingInRedis(orderDetail._id);
    sendToCustomerPushNotification(customerId, {
      notification: {
        title: `New booking #${orderDetail.orderNo}`,
        body: "Your booking successfully placed.",
      },
      data: {
        notificationType: "bookingPlaces",
        bookingId: orderDetail._id,
      },
    });
    if (!orderDetail?.scheduled?.scheduledAt) {
      if (jobSendByRedis) {
        findNearDriverFromRedis(orderDetail);
      } else {
        findNearDriver(orderDetail);
      }
      surgeUpdated();
      surgeCompleteProcessForSingleZone(
        orderDetail?.tripAddress[0].location.latitude,
        orderDetail?.tripAddress[0].location.longitude
      );
    }

    if (orderDetail?.scheduled?.scheduledAt) {
      // find all driver of 30 km range and send notification
      let drivers = await getNearByDrivers(
        [
          {
            location: {
              latitude: orderDetail.tripAddress[0].location.latitude,
              longitude: orderDetail.tripAddress[0].location.longitude,
            },
          },
        ],
        30000,
        [true, false]
      );

      for (const singleDriver of drivers) {
        sendToDriverPushNotification(singleDriver._id, {
          notification: {
            title: `Scheduled Job Nearby`,
            body: "You can accept this job by from schedule tab ",
          },
          data: {
            notificationType: "jobInSchdule",
          },
        });
      }
    }
  }
};

export const placeBooking = async ({ request, body, error }: any) => {
  try {
    // if (!request?.user?.deviceInfo?.systemName || request?.user?.deviceInfo?.systemName?.toLowerCase() !== "ios") {
    //   return error(400, { success: false, message: "We are under maintenance. Keep patience", data: {} });
    // }
    if (!body?.selectedVehicle?.status) {
      return error(400, {
        success: false,
        message: "Choose a suitable ride",
        data: {},
      });
    }
    if (!request.user.fullName) {
      return error(400, {
        success: false,
        message: "Add Name to your profile",
        data: {},
      });
    }
    if (!request.user.phone) {
      return error(400, {
        success: false,
        message: "Add Phone to your profile",
        data: {},
      });
    }
    if (!request.user.email) {
      return error(400, {
        success: false,
        message: "Add Email to your profile",
        data: {},
      });
    }

    // const longitudes = new Set();
    // const titles = new Set();
    // if (body?.tripAddress?.length === 2) {
    //   for (const element of body?.tripAddress) {
    //     if (longitudes?.has(element?.location?.longitude) || titles?.has(element?.title)) {
    //       return error(400, {
    //         success: false,
    //         message: "Choose a different address",
    //         data: {},
    //       });
    //     }
    //     longitudes.add(element?.location?.longitude);
    //     titles.add(element?.title);
    //   }
    // }

    for (const element of body?.tripAddress) {
      let availableZones = await geoZonesModel
        .findOne({
          location: {
            $geoIntersects: {
              $geometry: {
                type: "Point",
                coordinates: [
                  element?.location?.longitude,
                  element?.location?.latitude,
                ],
              },
            },
          },
        })
        .lean();
      if (availableZones?.geoPoint?.coordinates?.length === 2) {
        element.location.longitude = availableZones?.geoPoint?.coordinates[0];
        element.location.latitude = availableZones?.geoPoint?.coordinates[1];
      }
      if (element.title === "50 Commonwealth Ave") {
        element.location.longitude = -52.805739;
        element.location.latitude = 47.5156912;
      }
    }

    const routes = await getDirections([...body?.tripAddress]);
    if (!routes) {
      return error(400, { success: false, message: "Route not available." });
    }
    let distance: any = routes[0]?.legs?.reduce(
      (prev: any, curr: any) => prev + curr.distance.value,
      0
    );
    let duration: any = routes[0]?.legs?.reduce(
      (prev: any, curr: any) => prev + curr.duration.value,
      0
    );
    if (distance < 50 && duration < 30) {
      return error(400, {
        success: false,
        message: "Pickup and drop-off location are too close",
      });
    }

    let selectedVehicleDetails = await pricingForUserModel
      .findOne({
        _id: body?.selectedVehicle?.pricingModalId,
        customer: request?.user?._id,
      })
      .lean();
    if (!selectedVehicleDetails) {
      return error(400, {
        success: false,
        message: "Choose a suitable ride",
        data: {},
      });
    }

    let grandTotal = parseFloat(
      (body?.selectedVehicle?.discount || body.selectedVehicle.price)?.toFixed(
        2
      )
    );
    let withAdvanceNetPayment = grandTotal;

    let discountedTotal = parseFloat(
      Math.min(
        parseFloat(body?.selectedVehicle?.discount),
        parseFloat(body.selectedVehicle.price)
      )?.toFixed(2)
    );

    const baseQuery: any = {
      customer: request?.user?._id,
      $or: [
        { scheduled: { $exists: false } },
        { "scheduled.isScheduled": false },
      ],
      tripStatus: {
        $in: [
          bookingStatus.finding_driver,
          bookingStatus.ontheway,
          bookingStatus.arrived,
          bookingStatus.picked,
        ],
      },
    };

    const existingBooking = await rideBookingsModel.findOne(baseQuery).sort({ createdAt: -1 }).lean();
    if (existingBooking) {
      if (existingBooking?.paymentStatus) {
        return error(400, {
          success: false,
          message: "You have already placed a booking",
          data: {},
        });
      }
      if (
        existingBooking?.grandTotal === grandTotal &&
        new Date(existingBooking?.createdAt) >= new Date(Date.now() - 10 * 1000)
      ) {
        return error(400, {
          success: false,
          message: "Checking last booking payment. Try later",
          data: {},
        });
      }
    }

    if (body.paymentMethodId == "wallet") {
      if (request.user.wallet < withAdvanceNetPayment) {
        return error(400, {
          success: false,
          message: "Insufficient funds",
          data: {},
        });
      }
      let orderDetail = await placeAndConfirmOrder(
        request,
        {
          ...body,
          pricingModalId: body?.selectedVehicle?.pricingModalId,
          selectedVehicle: selectedVehicleDetails?.vehicleType,
        },
        grandTotal,
        discountedTotal,
        "wallet",
        true,
        "succeeded"
      );
      await afterPlaceBooking(orderDetail);
      return {
        success: true,
        message: "Booking successfully placed",
        data: { type: "wallet", orderDetails: orderDetail },
      };
    } else if (discountedTotal != 0) {
      let pmethodId = body.paymentMethodId;
      let defaultPaymet = pmethodId.includes("pm_")
        ? { methodId: pmethodId }
        : pmethodId.includes("ccof:") || pmethodId.includes("cnon:")
          ? { squareMethodId: pmethodId }
          : await paymentMethodsModel.findOne({ _id: pmethodId }).lean();

      if (!defaultPaymet?.methodId && !defaultPaymet?.squareMethodId) {
        return error(400, {
          success: false,
          message: "Payment failed",
          data: {},
        });
      }

      let orderDetails: any = await placeAndConfirmOrder(
        request,
        {
          ...body,
          pricingModalId: body?.selectedVehicle?.pricingModalId,
          selectedVehicle: selectedVehicleDetails?.vehicleType,
        },
        grandTotal,
        discountedTotal,
        defaultPaymet,
        false,
        "created"
      );

      if (
        defaultPaymet?.squareMethodId?.includes("ccof:") ||
        defaultPaymet?.squareMethodId?.includes("cnon:")
      ) {
        let squarePaymentIntent: any = await createSquarePayment(
          request,
          parseInt(withAdvanceNetPayment.toFixed(2).replace(".", "")),
          defaultPaymet?.squareMethodId,
          "Booking",
          String(orderDetails._id)
        );
        if (squarePaymentIntent) {
          await rideBookingsModel.updateOne(
            { _id: orderDetails._id },
            {
              paymentIntentId: squarePaymentIntent.payment.id,
            }
          );
          return {
            success: true,
            message: "Confirm your card payment",
            data: {
              orderDetails,
              squarePaymentId: squarePaymentIntent.payment.id,
            },
          };
        } else {
          if (jobSendByRedis) {
            await updateBookingInRedis(orderDetails._id, {
              paymentStatus: false,
              tripStatus: bookingStatus.canceled,
              paymentStep: "failed",
              cancelledAt: new Date(),
            });
          }
          await rideBookingsModel.findByIdAndUpdate(orderDetails._id, {
            paymentStatus: false,
            tripStatus: bookingStatus.canceled,
            paymentStep: "failed",
            cancelledAt: new Date(),
          });
          return error(400, {
            success: false,
            message: "Payment failed",
          });
        }
      } else if (defaultPaymet?.methodId?.includes("pm_")) {
        await attachPaymentMethod({
          request: { ...request },
          body: { ...body, paymentMethod: defaultPaymet },
        });
        let intent = await createPaymentintent(
          request,
          parseInt(withAdvanceNetPayment.toFixed(2).replace(".", "")),
          "manual",
          defaultPaymet?.methodId,
          "Booking",
          String(orderDetails._id)
        );

        if (intent) {
          await rideBookingsModel.updateOne(
            { _id: orderDetails._id },
            {
              paymentIntentId: intent.id,
              forceUpdateInDB: true,
            }
          );
          return {
            success: true,
            message: "Confirm your card payment",
            data: {
              orderDetails,
              clientSecret: intent.client_secret,
            },
          };
        } else {
          if (jobSendByRedis) {
            await updateBookingInRedis(orderDetails._id, {
              paymentStatus: false,
              tripStatus: bookingStatus.canceled,
              paymentStep: "failed",
              cancelledAt: new Date(),
            });
          }
          await rideBookingsModel.findByIdAndUpdate(orderDetails._id, {
            paymentStatus: false,
            tripStatus: bookingStatus.canceled,
            paymentStep: "failed",
            cancelledAt: new Date(),
          });
          return error(400, {
            success: false,
            message: "Payment failed",
          });
        }
      } else {
        if (jobSendByRedis) {
          await updateBookingInRedis(orderDetails._id, {
            paymentStatus: false,
            tripStatus: bookingStatus.canceled,
            paymentStep: "failed",
            cancelledAt: new Date(),
          });
        } else {
          await rideBookingsModel.findByIdAndUpdate(orderDetails._id, {
            paymentStatus: false,
            tripStatus: bookingStatus.canceled,
            paymentStep: "failed",
            cancelledAt: new Date(),
          });
        }
        return error(400, {
          success: false,
          message: "Payment failed",
        });
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      message: "Unable to place booking",
    });
  }
};

export const singleBookingData = async ({
  request,
  body,
  query,
  params,
  error,
}: any) => {


  try {
    let item = null;
    if (!mongoose.isValidObjectId(params.id)) {
      return error(400, { success: false, message: "Invalid request" });
    }

    if (typeof query.populate != "undefined") {
      if (jobSendByRedis) {
        item = await getBookingFromRedis(params.id);
      }

      if (!item) {
        item = await rideBookingsModel
          .findById(params.id)
          .populate(query?.populate)
          .lean();
      }
    } else {
      if (jobSendByRedis) {
        item = await getBookingFromRedis(params.id);
      }
      if (!item) {
        item = await rideBookingsModel.findById(params.id).lean();
      }
    }

    if (!item) {
      return error(400, { success: false, message: "No item found" });
    }

    if (item.driver && item.tripStatus !== bookingStatus.picked) {
      let activeBookingCount;
      if (jobSendByRedis) {
        activeBookingCount = await getActiveBookingCountFromRedis(
          item?.driver?._id
        );
      } else {
        activeBookingCount = await rideBookingsModel.countDocuments({
          driver: item?.driver,
          paymentStatus: true,
          tripStatus: {
            $in: [
              bookingStatus.arrived,
              bookingStatus.ontheway,
              bookingStatus.picked,
            ],
          },
          $or: [
            { "scheduled.scheduledAt": null },
            {
              $and: [
                { "scheduled.scheduledAt": { $ne: null } },
                { "scheduled.startRide": true },
              ],
            },
          ],
        });
      }

      let otherActiveBookingDetails = null;
      if (activeBookingCount >= 2 && item.tripStatus !== bookingStatus.picked) {
        if (typeof query.populate != "undefined") {
          if (jobSendByRedis) {
            otherActiveBookingDetails = await getSecondActiveBookingFromRedis(
              item?.driver?._id,
              params.id
            );
          } else {
            otherActiveBookingDetails = await rideBookingsModel
              .findOne({
                driver: item?.driver,
                _id: { $ne: params.id },
                tripStatus: {
                  $in: [
                    bookingStatus.arrived,
                    bookingStatus.ontheway,
                    bookingStatus.picked,
                  ],
                },
                $or: [
                  { "scheduled.scheduledAt": null },
                  {
                    $and: [
                      { "scheduled.scheduledAt": { $ne: null } },
                      { "scheduled.startRide": true },
                    ],
                  },
                ],
                paymentStatus: true,
              })
              .populate(query?.populate)
              .lean();
          }
        } else {
          if (jobSendByRedis) {
            otherActiveBookingDetails = await getSecondActiveBookingFromRedis(
              item?.driver?.id,
              params.id
            );
          } else {
            otherActiveBookingDetails = await rideBookingsModel
              .findOne({
                driver: item?.driver,
                _id: { $ne: params.id },
                tripStatus: {
                  $in: [
                    bookingStatus.arrived,
                    bookingStatus.ontheway,
                    bookingStatus.picked,
                  ],
                },
                $or: [
                  { "scheduled.scheduledAt": null },
                  {
                    $and: [
                      { "scheduled.scheduledAt": { $ne: null } },
                      { "scheduled.startRide": true },
                    ],
                  },
                ],
                "scheduled.scheduledAt": null,
                paymentStatus: true,
              })
              .lean();
          }
        }
      }

      if (otherActiveBookingDetails) {
        const { Distancekm, DurationMin } = await getDirectionsDistanceTime(
          item?.driver,
          otherActiveBookingDetails.tripAddress,
          true
        );
        item = {
          ...item,
          activeBookingCount,
          otherActiveBookingDetails,
          Distancekm,
          DurationMin,
        };
      } else {
        item = { ...item, activeBookingCount, otherActiveBookingDetails };
      }
    }
    let callDetailsToken = setUpForVoiceCall(0, params.id);
    item = { ...item, callDetailsToken };

    if (item?.driver?._id) {
      let driverFromRedis: any = await getDriverFromRedis(item?.driver?._id);
      item = {
        ...item,
        driver: {
          ...item?.driver,
          location: driverFromRedis[0]?.location,
        },
      };
    }

    try {
      const now = Date.now();

      if (
        ([bookingStatus?.ontheway, bookingStatus?.arrived, bookingStatus?.picked].includes(item?.tripStatus)) &&
        ((item?.driver &&
          item?.tripAddress &&
          (!item?.timingLastUpdated || now - new Date(item?.timingLastUpdated).getTime() > TEN_SECONDS)) ||
          (item?.otherActiveBookingDetails &&
            (!item?.timingLastUpdated ||
              now - new Date(item?.timingLastUpdated).getTime() >
              TEN_SECONDS)
          ))) {

        try {

          const driverPoint = {
            location: {
              latitude: item?.driver?.location?.coordinates[1],
              longitude: item?.driver?.location?.coordinates[0],
            },
          };
          let addresses: any = [];

          if (item?.otherActiveBookingDetails) {


            const lastOfCurrent =
              Array.isArray(item?.otherActiveBookingDetails?.tripAddress) && item?.otherActiveBookingDetails?.tripAddress.length
                ? item?.otherActiveBookingDetails?.tripAddress[item?.otherActiveBookingDetails?.tripAddress.length - 1]
                : item?.otherActiveBookingDetails?.tripAddress;

            const firstOfOther =
              Array.isArray(item?.tripAddress) && item?.tripAddress.length
                ? item?.tripAddress[0]
                : item?.tripAddress;

            addresses = [lastOfCurrent, firstOfOther];
          } else if (
            item?.tripStatus === bookingStatus.ontheway ||
            item?.tripStatus === bookingStatus.arrived
          ) {
            addresses = item?.tripAddress[0];
          } else if (item?.tripStatus === bookingStatus.picked) {
            addresses = item?.tripAddress[item?.tripAddress.length - 1];
          }

          const routeAddresses = Array.isArray(addresses) ? [driverPoint, ...addresses] : [driverPoint, addresses];

          const routes = await getDirections(routeAddresses, false);
          const route = routes[0];

          let distance = 0;
          let duration = 0;

          if (route.legs && Array.isArray(route.legs)) {
            distance = route.legs.reduce((prev: any, curr: any) => {
              const legDistance = curr.distance?.value || curr.distance || 0;
              return prev + legDistance;
            }, 0);

            duration = route.legs.reduce((prev: any, curr: any) => {
              const legDuration = curr.duration?.value || curr.duration || 0;
              return prev + legDuration;
            }, 0);
          }
          let timeDetails = {
            km: parseFloat((distance / 1000).toFixed(1)),
            kmText: `${(distance / 1000).toFixed(1)} km`,
            durationText: `${Math.round(duration / 60)} mins ${(Math.round(duration % 60))} secs`,
            duration: Math.round(duration / 60),
          };
          item = { ...item, driverRouteProgress: timeDetails, timingLastUpdated: new Date() };


          if (jobSendByRedis) {
            await updateBookingInRedis(String(params.id), { driverRouteProgress: timeDetails, timingLastUpdated: new Date() }, true);
          }
        } catch (e: any) {
          logger.error({ error: e, msg: e.message });
        }
      }
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
    }
    return { success: true, data: item };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, data: [], message: "0 booking" });
  }
};
export const invoiceRideBooking = async ({
  request,
  body,
  query,
  params,
  response,
  error,
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
    const name = request.user.fullName;
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
        ? `${orderDetails.selectedVehicle.surgeCharge}`
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
    const rideDurationKm = orderDetails?.finalBilling?.kmText;
    const rideDuration = orderDetails?.finalBilling?.durationText;
    const pickedAt = orderDetails?.pickedAt;
    const dropedAt = orderDetails?.dropedAt;

    let driverDetails: any = await driversModel.findOne({ _id: orderDetails?.driver }).lean();
    const driverName = driverDetails?.fullName;
    const vehicleDetails = `${driverDetails?.vehicleInfo?.vehicleMake} - ${driverDetails?.vehicleInfo?.vehicleModel} - ${driverDetails?.vehicleInfo?.vehicleNo}`;

    const withTip = body.withTip;
    let pdfData;
    let htmlContent;
    if (isCancellationCharges) {
      pdfData = { CancellationFee, tax, withTip, pickUp, dropOff, orderNo, totalWithTip, totalWithOutTip, createdAt, driverName, vehicleDetails, rideDurationKm, rideDuration, pickedAt, dropedAt };
      htmlContent = invoicePdfFile(pdfData, true);
    } else if (orderDetails?.tripStatus !== 'canceled') {
      pdfData = { totalFare, tax, discount, tip, rideTime, pickUp, dropOff, orderNo, waitingCharges, surge, withTip, totalWithTip, totalWithOutTip, createdAt, driverName, vehicleDetails, rideDurationKm, rideDuration, pickedAt, dropedAt };
      htmlContent = invoicePdfFile(pdfData, false);
    } else {
      pdfData = { totalFare: "0.00", tax: "0.00", discount: "0.00", tip: "0.00", rideTime, pickUp, dropOff, orderNo, waitingCharges: "0.00", surge, withTip: "0.00", totalWithTip: "0.00", totalWithOutTip: "0.00", createdAt, driverName, vehicleDetails, rideDurationKm, rideDuration, pickedAt, dropedAt };
      htmlContent = invoicePdfFile(pdfData, false);
    }
    const fileName = generateUniqueInvoiceName(name, orderNo);
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
      unlink(response.filename).catch((e) =>
        logger.error({ error: e, msg: e.message })
      );
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
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Internal Server Error" });
  }
};

export const callCreationTwillo = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    // let orderDetails = await rideBookingsModel
    //     .findOne({ _id: body.bookingId })
    //     .populate("customer driver");

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

    // res
    //     .status(200)
    //     .json({ message: "Call initiated successfully", callSid: "call.sid" });
    return { success: true, data: {} };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Call not available" });
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

export const webhookIntegratedTwillo = async ({
  request,
  body,
  query,
  params,
  response,
}: any) => {
  // try {
  //     const twiml = new twilio.twiml.VoiceResponse();
  //     twiml.say('Connecting your call, please wait...');
  //     const dial = twiml.dial();
  //     dial.number('+917060810244');
  //     res.type('text/xml');
  //     return res.status(200).json({ success: true, data: twiml.toString() });
  // } catch (e) {
  //     logger.error({ error: e, msg: e.message });
  //     return res.status(400).json({ success: false, message: `Call not available` });
  // }

  /**
   *  Call Forward Template
   *
   *  This Function will forward a call to another phone number. If the call isn't answered or the line is busy,
   *  the call is optionally forwarded to a specified URL. You can optionally restrict which calling phones
   *  will be forwarded.
   */
  // exports.handler = function (context, event, callback) {
  // set-up the variables that this Function will use to forward a phone call using TwiML

  // REQUIRED - you must set this
  // let phoneNumber = event?.PhoneNumber || "NUMBER TO FORWARD TO";
  // // OPTIONAL
  // let callerId = event.CallerId || null;
  // // OPTIONAL
  // let timeout = event.Timeout || null;
  // // OPTIONAL
  // let allowedCallers = event.allowedCallers || [];

  // generate the TwiML to tell Twilio how to forward this call
  // let twiml = new twilio.twiml.VoiceResponse();
  // twiml.dial({}, "+917060810244");
  // let allowedThrough = true
  // if (allowedCallers.length > 0) {
  //     if (allowedCallers.indexOf(event.From) === -1) {
  //         allowedThrough = false;
  //     }
  // }
  // let dialParams = {};
  // if (callerId) {
  //     dialParams.callerId = callerId
  // }
  // if (timeout) {
  //     dialParams.timeout = timeout
  // }

  // if (allowedThrough) {
  //     twiml.dial(dialParams, phoneNumber);
  // }
  // else {
  //     twiml.say('Sorry, you are calling from a restricted number. Good bye.');
  // }
  // return res.status(200).json({ success: true, data: twiml.toString() });
  // return the TwiML
  //     callback(null, twiml);
  // };
  return { success: true, data: {} };
};

export const cancelBooking = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    body = { ...body, status: bookingStatus.canceled };

    let orderDetails: any = null;

    if (jobSendByRedis) {
      orderDetails = await getBookingFromRedis(params.id);
    } else {
      orderDetails = await rideBookingsModel
        .findOne({ _id: params.id })
        .populate("driver")
        .lean();
    }
    if (!orderDetails) {
      orderDetails = await rideBookingsModel.findOne({ _id: params.id });
    }
    if (!orderDetails) {
      return error(404, {
        success: false,
        message: `Booking not found for customer`,
        statusCode: 404,
      });
    }

    if (orderDetails.tripStatus.toLowerCase() == bookingStatus?.completed) {
      return error(400, {
        success: false,
        message: `Booking already completed.`,
      });
    }

    if (orderDetails.tripStatus.toLowerCase() == bookingStatus?.canceled) {
      return error(400, {
        success: false,
        message: `Booking already cancelled.`,
      });
    }

    if (
      String(orderDetails?.customer?._id || orderDetails?.customer) !==
      String(request?.user?._id)
    ) {
      return error(400, { success: false, message: `Other customer Booking` });
    }
    let updateData: any = { tripStatus: body?.status };

    if (
      ![
        bookingStatus.finding_driver,
        bookingStatus.ontheway,
        bookingStatus.arrived,
      ].includes(orderDetails?.tripStatus?.toLowerCase())
    ) {
      return error(400, {
        success: false,
        message: `Booking cancellation failed. Please contact support`,
      });
    }

    updateData = {
      ...updateData,
      canceledBy: "user",
      canceledReason: body.reson,
      cancelledAt: new Date(),
    };

    if (
      [bookingStatus.ontheway, bookingStatus.arrived].includes(
        orderDetails.tripStatus.toLowerCase()
      )
    ) {
      const now = Date.now();
      const acceptedAt = new Date(orderDetails.acceptedAt).getTime();

      const threshold =
        acceptedAt +
        cancellatinChargesApplyAfterJobPickedByDriverButNotArriving +
        orderDetails?.pickUpTime * 60 * 1000;

      const isAnyOtherActiveBooking = await rideBookingsModel.findOne({
        $or: [
          { "scheduled.scheduledAt": null },
          {
            $and: [
              { "scheduled.scheduledAt": { $ne: null } },
              { "scheduled.startRide": true },
            ],
          },
        ],
        orderNo: { $ne: orderDetails?.orderNo },
        paymentStatus: true,
        driver: orderDetails?.driver,
        tripStatus: {
          $in: [
            bookingStatus.picked,
            bookingStatus.ontheway,
            bookingStatus.arrived,
          ],
        },
      });

      if (
        (new Date(Date.now() - cancellatinChargesApplyAfterJobCancelByCustomer) >
          new Date(orderDetails.acceptedAt) &&
          now < threshold &&
          !isAnyOtherActiveBooking && !orderDetails?.scheduled?.isScheduled) ||
        (new Date(Date.now() - cancellatinChargesApplyAfterJobCancelByCustomer) >
          new Date(orderDetails?.acceptedAt) &&
          now < threshold &&
          !isAnyOtherActiveBooking && orderDetails?.scheduled?.isScheduled &&
          new Date(orderDetails?.scheduled?.scheduledAt) <= new Date(Date.now() + 30 * 60 * 1000)
        )
      ) {
        let cancellationChargesObj = {
          description: "Cancellation Charges",
          charges: 6.09,
          tax: 0.91,
          total: 7.0,
        };
        let driverEarningChargesObj = {
          description: "Driver Earning",
          charges: 4.5,
          tax: 4.5 * 0.15,
          total: 5.175,
        };

        if (orderDetails.paymentMethodId == "wallet") {
          await usersModel.updateOne(
            { _id: orderDetails.customer },
            { $inc: { wallet: -cancellationChargesObj.total || 0 } }
          );
          await userWalletTransactionsModel.create({
            amount: -cancellationChargesObj.total || 0,
            description: "Cancellation charges of booking",
            trxType: "Debit",
            trxId: `WLT${generateRandomNumbers(6)}`,
            user: orderDetails.customer,
          });
          await activityLogsModel.create({
            title: "Removed money in wallet by user",
            description: "Cancellation charges of booking",
            user: orderDetails.customer,
          });
        } else {
          if (orderDetails?.paymentIntentId?.includes("pi_")) {
            await capturePaymentIntent(
              orderDetails?.paymentIntentId || "",
              cancellationChargesObj.total * 100
            );
          } else if (orderDetails?.paymentIntentId) {
            await squareCompletePayment(
              orderDetails?.paymentIntentId || "",
              cancellationChargesObj.total * 100
            );
          }
        }

        updateData = {
          ...updateData,
          "finalBilling.userBilling.cancellationCharges":
            cancellationChargesObj.charges,
          "finalBilling.userBilling.tax.taxTotal": cancellationChargesObj.tax,
          "finalBilling.userBilling.totalAmount": cancellationChargesObj.total,
          "finalBilling.driverEarning.cancellationPrice":
            driverEarningChargesObj.charges,
          "finalBilling.driverEarning.driverTax": driverEarningChargesObj.tax,
          "finalBilling.driverEarning.grandTotal":
            driverEarningChargesObj.total,
        };

        // await rideBookingsModel.updateOne({ _id: orderDetails?._id }, {
        //   "finalBilling.userBilling.cancellationCharges": cancellationChargesObj.charges,
        //   "finalBilling.userBilling.tax.taxTotal": cancellationChargesObj.tax,
        //   "finalBilling.userBilling.totalAmount": cancellationChargesObj.total,
        //   "finalBilling.driverEarning.cancellationPrice": driverEarningChargesObj.charges,
        //   "finalBilling.driverEarning.driverTax": driverEarningChargesObj.tax,
        //   "finalBilling.driverEarning.grandTotal": driverEarningChargesObj.total
        // })

        await driversModel.updateOne(
          { _id: orderDetails?.driver?._id },
          { $inc: { wallet: driverEarningChargesObj.total } }
        );

        await driversWalletTransactionModel.create({
          description: "On ride cancellation",
          amount: driverEarningChargesObj.total,
          trxType: "Credit",
          driver: orderDetails?.driver?._id,
          bookingId: orderDetails._id,
        });
      } else {
        if (orderDetails?.paymentIntentId?.includes("pi_")) {
          await cancelledPayment(orderDetails?.paymentIntentId || "");
        } else if (orderDetails?.paymentIntentId) {
          await squareCancelPayment(orderDetails?.paymentIntentId || "");
        }
      }
    } else {
      if (orderDetails?.paymentIntentId?.includes("pi_")) {
        await cancelledPayment(orderDetails?.paymentIntentId || "");
      } else if (orderDetails?.paymentIntentId) {
        await squareCancelPayment(orderDetails?.paymentIntentId || "");
      }
    }

    if (orderDetails && orderDetails?.driver) {
      const isAnyOtherActiveBooking = await rideBookingsModel.findOne({
        $or: [
          { "scheduled.scheduledAt": null },
          {
            $and: [
              { "scheduled.scheduledAt": { $ne: null } },
              { "scheduled.startRide": true },
            ],
          },
        ],
        orderNo: { $ne: orderDetails?.orderNo },
        paymentStatus: true,
        driver: orderDetails?.driver,
        tripStatus: {
          $in: [
            bookingStatus.picked,
            bookingStatus.ontheway,
            bookingStatus.arrived,
          ],
        },
      });

      if (!isAnyOtherActiveBooking) {
        await driversModel.updateOne(
          { _id: orderDetails?.driver?._id },
          { iAmBusy: false }
        );
      } else {
        await driversModel.updateOne(
          { _id: orderDetails?.driver?._id },
          { iAmBusy: true }
        );
      }

      sendToDriverPushNotification(String(orderDetails.driver?._id), {
        notification: {
          title: `Job is cancelled by customer`,
          body: "",
        },
        data: {
          notificationType: "jobCancelled",
          bookingId: orderDetails._id,
        },
      });
    }

    if (orderDetails?.scheduled?.isScheduled) {
      let drivers = await getNearByDrivers(
        [
          {
            location: {
              latitude: orderDetails.tripAddress[0].location.latitude,
              longitude: orderDetails.tripAddress[0].location.longitude,
            },
          },
        ],
        30000,
        [true, false]
      );
      for (const singleDriver of drivers) {
        sendToDriverPushNotification(String(singleDriver._id), {
          data: {
            notificationType: "jobInSchdule",
          },
        });
        // sendSocket(singleDriver?.socket_id?.toString(), "jobInSchdule", {})
        sendToDriverSocket(singleDriver?.socket_id?.toString(), {
          event: "jobInSchdule",
          data: {},
        });
      }
    }

    let rejectedDriver = orderDetails?.rejectedDriver || [];
    rejectedDriver = [
      ...new Set(rejectedDriver?.map((itm: any) => itm?.toString())),
    ];

    let drivers = await getNearByDrivers(
      [
        {
          location: {
            latitude: orderDetails.tripAddress[0].location.latitude,
            longitude: orderDetails.tripAddress[0].location.longitude,
          },
        },
      ],
      50000,
      [false],
      0,
      rejectedDriver
    );

    for (const singleDriver of drivers) {
      sendToDriverPushNotification(singleDriver._id, {
        data: {
          notificationType: "jobInMatch",
        },
      });
      // sendSocket(singleDriver?.socket_id?.toString(), "jobInMatch", {});
      sendToDriverSocket(singleDriver?.socket_id?.toString(), {
        event: "jobInMatch",
        data: {},
      });
    }
    // sendToAllUsers("DriverLocationUpdate", {
    //   driverId: orderDetails?.driver?._id || orderDetails?.driver,
    //   location: {
    //     type: "Point",
    //     coordinates: [
    //       orderDetails?.driver?.location?.coordinates[0] || 0,
    //       orderDetails?.driver?.location?.coordinates[1] || 0,
    //     ],
    //   },
    //   heading: orderDetails?.driver?.heading,
    // })

    if (orderDetails.paymentStatus === false) {
      await rideBookingsModel.updateOne({ _id: orderDetails?._id }, updateData);
    }

    if (jobSendByRedis) {
      await updateBookingInRedis(orderDetails._id, {
        ...updateData,
      });
    } else {
      await rideBookingsModel.findByIdAndUpdate(orderDetails._id, updateData);
    }

    // sendSocket(request?.user?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id })
    sendToUserSocket(request?.user?._id?.toString(), {
      event: "singlebookingStatusUpdated",
      data: { bookingId: params.id },
    });

    // if (orderDetails?.carPoolDetails?.isBookingUnderPool) {
    //   await rideBookingsModel.updateOne(
    //     {
    //       "carPoolDetails.bookingPoolDetails.poolId": orderDetails?.carPoolDetails?.bookingPoolDetails?.poolId,
    //       "carPoolDetails.bookingPoolDetails.startTime": { $ne: null },
    //       paymentStatus: true,
    //     },
    //     {
    //       $inc: { "carPoolDetails.bookingPoolDetails.currentPassengers": -orderDetails?.switchRider?.passenger }
    //     }
    //   );

    //   let isDriverUnderPool = await rideBookingsModel.findOne({
    //     "carPoolDetails.isBookingUnderPool": true,
    //     tripStatus: { $in: [bookingStatus.ontheway, bookingStatus.picked, bookingStatus.arrived] },
    //     paymentStatus: true,
    //     driver: orderDetails?.driver,
    //   }).lean()

    //   if (!isDriverUnderPool) {
    //     await driversModel
    //       .updateOne(
    //         { _id: orderDetails?.driver },
    //         {
    //           isDriverUnderPool: false
    //         }
    //       )
    //   }
    //   sendSocket(orderDetails.driver?._id?.toString(), "poolUpdated", { poolId: orderDetails?.carPoolDetails?.bookingPoolDetails?.poolId })
    // }

    if (orderDetails.driver?._id) {
      // sendSocket(orderDetails.driver?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id })
      sendToDriverSocket(orderDetails.driver?._id?.toString(), {
        event: "singlebookingStatusUpdated",
        data: { bookingId: params.id },
      });
    }

    if (orderDetails.driver?._id) {
      const isAnyOtherActiveBooking = await rideBookingsModel
        .findOne({
          $or: [
            { "scheduled.scheduledAt": null },
            {
              $and: [
                { "scheduled.scheduledAt": { $ne: null } },
                { "scheduled.startRide": true },
              ],
            },
          ],
          driver: orderDetails?.driver,
          tripStatus: { $in: ["picked", "ontheway", "arrived"] },
          paymentStatus: true,
        })
        .lean();
      if (isAnyOtherActiveBooking) {
        // sendSocket(orderDetails.driver?._id?.toString(), "singlebookingStatusUpdated", { bookingId: isAnyOtherActiveBooking._id, })
        sendToDriverSocket(orderDetails.driver?._id?.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: isAnyOtherActiveBooking._id },
        });
      } else {
        // sendSocket(orderDetails.driver?._id?.toString(), "singlebookingStatusUpdated", { bookingId: params.id })
        sendToUserSocket(orderDetails.driver?._id?.toString(), {
          event: "singlebookingStatusUpdated",
          data: { bookingId: params.id },
        });
      }
    }
    await deleteMatchNotification("*", orderDetails?._id?.toString());

    surgeUpdated();
    surgeCompleteProcessForSingleZone(
      orderDetails?.tripAddress[0].location.latitude,
      orderDetails?.tripAddress[0].location.longitude
    );
    return {
      success: true,
      message: orderDetails?.paymentStatus
        ? `Booking Status Update successfully to ${body.status}`
        : "",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Payment failed" });
  }
};

export const tipToDriver = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    let orderDetails: any = await rideBookingsModel
      .findById(body.bookingId)
      .lean();

    if (orderDetails?.tipStatus === "Pending") {
      return error(400, {
        success: false,
        message: "Your last Payment is under processing",
      });
    }
    if (orderDetails?.tip > 0) {
      return error(400, {
        success: false,
        message: "Tip has already been added",
      });
    }

    const hasTip = orderDetails?.finalBilling?.pricing?.some(
      (item: any) => item.name === "Tip"
    );
    if (hasTip) {
      return error(400, {
        success: false,
        message: "Tip has already been added",
      });
    }

    if (orderDetails && body.tip === 0) {
      let orderDetail: any = await rideBookingsModel.updateOne(
        { _id: body.bookingId },
        {
          tip: parseFloat(body.tip),
          $push: {
            "finalBilling.pricing": {
              name: "Tip",
              price: 0,
            },
          },
          tipStatus: "Success",
          forceUpdateInDB: true,
        }
      );
      return { success: true, data: { orderDetail } };
    }

    if (orderDetails && body.paymentMethodId == "wallet") {
      if (request.user.wallet < parseFloat(body.tip)) {
        return error(400, {
          success: false,
          data: {},
          message: "Insufficient funds",
        });
      }

      await usersModel.updateOne(
        { _id: request?.user?._id },
        {
          $inc: { wallet: -parseFloat(body.tip) },
        }
      );
      await userWalletTransactionsModel.create({
        amount: -parseFloat(body.tip),
        description: "Removed money in wallet by user",
        trxType: "Debit",
        trxId: `WLT${generateRandomNumbers(6)}`,
        user: request?.user?._id,
      });
      await activityLogsModel.create({
        title: "Removed money in wallet by user",
        description: "Tip to driver",
        user: request?.user?._id,
      });

      let orderDetail: any = await rideBookingsModel.updateOne(
        { _id: body.bookingId },
        {
          tip: parseFloat(body.tip),
          "finalBilling.driverEarning.tips": parseFloat(body.tip),
          "finalBilling.userBilling.tip": parseFloat(body.tip),
          $inc: {
            "finalBilling.userBilling.totalAmount": parseFloat(body.tip),
            "finalBilling.driverEarning.grandTotal": parseFloat(body.tip),
          },
          $push: {
            "finalBilling.pricing": {
              name: "Tip",
              price: parseFloat(body.tip),
            },
          },
          tipStatus: "Success",
          forceUpdateInDB: true,
        }
      );

      await driversModel.updateOne(
        { _id: orderDetails?.driver },
        {
          $inc: { wallet: parseFloat(body.tip) },
        }
      );

      await driversWalletTransactionModel.create({
        description: "tip received",
        amount: body.tip,
        trxType: "Credit",
        driver: orderDetails?.driver,
        bookingId: orderDetails?._id,
      });

      sendToDriverPushNotification(String(orderDetails.driver), {
        notification: {
          title: `You received tip $${body.tip}`,
          body: "",
        },
        data: {
          notificationType: "tipRecived",
          bookingId: orderDetails?._id,
        },
      });

      return {
        success: true,
        data: { method: "wallet", orderDetail },
        message: "Tip successfully sent",
      };
    } else {
      await rideBookingsModel.updateOne(
        { _id: body.bookingId },
        {
          tipStatus: "Pending",
        }
      );
      if (body?.paymentMethodId?.includes("pm_")) {
        let intent = await createPaymentintent(
          request,
          parseInt(parseFloat(body.tip).toFixed(2).replace(".", "")),
          "automatic_async",
          body.paymentMethodId,
          "tip",
          orderDetails._id
        );
        if (intent && orderDetails) {
          return {
            success: true,
            message: "Confirm your tip payment",
            clientSecret: intent.client_secret,
          };
        } else {
          await rideBookingsModel.updateOne(
            { _id: body.bookingId },
            {
              tipStatus: "Failed",
            }
          );
          return error(400, {
            success: false,
            data: {},
            message: "Payment failed",
          });
        }
      } else {
        if (
          body?.paymentMethodId?.includes("ccof:") ||
          body?.paymentMethodId?.includes("cnon:")
        ) {
          let squarePaymentIntent = await createSquarePayment(
            request,
            parseInt(parseFloat(body.tip).toFixed(2).replace(".", "")),
            body.paymentMethodId,
            "tip",
            orderDetails._id,
            true
          );
          if (squarePaymentIntent && orderDetails) {
            return {
              success: true,
              message: "Confirm your tip payment",
              squarePaymentId: squarePaymentIntent.payment.id,
            };
          } else {
            await rideBookingsModel.updateOne(
              { _id: body.bookingId },
              {
                tipStatus: "Failed",
              }
            );
            return error(400, {
              success: false,
              data: {},
              message: "Payment failed",
            });
          }
        }
      }
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      message: "Tip failed",
    });
  }
};

export const ratingToDriver = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    await rideBookingsModel.updateOne(
      { _id: body.bookingId },
      {
        driverRating: {
          description: body.description,
          stars: body.stars,
        },
        forceUpdateInDB: true,
      }
    );
    return { success: true, message: "Rating successfully submitted" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Something is wrong." });
  }
};

export const sosCall = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    await rideBookingsModel.updateOne(
      { _id: body.bookingId },
      {
        "sosCall.isSosCalled": true,
        "sosCall.sosCalledAt": new Date(),
      }
    );

    let orderDetails = await rideBookingsModel
      .findOne({ _id: body.bookingId })
      .populate("customer driver");
    if (process.env.isTestMode === "true") {
      sosCallNotification({ email: "random@yopmail.com" }, orderDetails);
    } else {
      sosCallNotification({ email: "jaspalsidhu007@gmail.com" }, orderDetails);
    }
    return { success: true, message: `Emergency feauture enabled` };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: `Internal Server Error` });
  }
};

export const lostItemBooking = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    await rideBookingsModel.updateOne(
      { _id: body.bookingId },
      {
        $set: {
          "lost.itemType": body?.itemType,
          "lost.seatType": body?.seatType,
          "lost.contact": body?.contact,
        },
      }
      // { new: true }
    );
    return { success: true, message: "Successfully submitted" };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Something is wrong." });
  }
};

export const bookingChat = async ({
  request,
  body,
  query,
  params,
  response,
  error,
}: any) => {
  try {
    return {
      success: true,
      data: { chat: await bookingChatModel.find({ chat: params.id }).lean() },
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, {
      success: false,
      data: {
        chat: [],
      },
    });
  }
};

export const updateRideAddress = async ({ params, body, error }: any) => {
  try {
    const booking = await rideBookingsModel.findOne({ _id: params.id }).lean();
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
      params.id,
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

export const shareLiveLocation = async ({
  request,
  params,
  body,
  error,
}: any) => {
  try {
    const { bookingId } = body;

    if (!bookingId) {
      return error(400, { success: false, message: "Invalid request data" });
    }

    await updateBookingInRedis(bookingId, { shareLocWithDriver: true });

    sendToCustomerPushNotification(String(request?.user?._id), {
      notification: {
        title: `Live Location Share`,
        body: "Your current location is shared with driver",
      },
      data: {
        notificationType: "locationShared",
      },
    });
    return {
      success: true,
      message: "Live location shared successfully",
    };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return error(400, { success: false, message: "Internal Server Error" });
  }
};
