import couponsModel from "@/modules/coupons/models/coupons.model";
import vehicleTypeModel from "@/modules/drivers/models/vehicleType.model";
import geoZonesModel from "@/modules/geo-zones/models/geoZones.model";
import { activeBookingsToActiveDrivers } from "@/modules/ride-bookings/controllers/helpers/surge.controller";
import rideBookingsModel from "@/modules/ride-bookings/models/rideBookings.model";
import { getDirections, getNearByDriverDetails, getNearByDrivers, getWeatherDetails } from "@/utils/map/mapboxHelper";
import pricingForUserModel from "../../models/pricingForUser.model";
import { log } from "winston";
import { getNearByCars } from "../../helpers/pricing.helper";

// ...existing code...

export const calculatePrice = async ({ request, body, error, settings, redis, userLocation }: any) => {
  try {
    // 1) Normalize addresses with zone snapping (in parallel)
    const normalizedAddresses = await Promise.all(
      (body?.address || []).map(async (element: any) => {
        const { location, title } = element || {};
        const coords = [location?.longitude, location?.latitude];

        // Snap to zone centroid if available
        const zone = await geoZonesModel
          .findOne({
            location: {
              $geoIntersects: { $geometry: { type: "Point", coordinates: coords } },
            },
          })
          .lean();

        const snapped = { ...element };

        if (zone?.geoPoint?.coordinates?.length === 2) {
          snapped.location = {
            ...snapped.location,
            longitude: zone.geoPoint.coordinates[0],
            latitude: zone.geoPoint.coordinates[1],
          };
        }

        // Hard override rule (kept from original)
        if (title === "50 Commonwealth Ave") {
          snapped.location = { ...snapped.location, longitude: -52.805739, latitude: 47.5156912 };
        }

        return snapped;
      })
    );

    // await redis?.sendCommand(['GEOADD', 'drivers:geo', '30.68993701238055', "76.68989901987335", "686bc27e6032e16b482eac49"]);
    // 2) Fetch routing and nearby data (in parallel)
    const [routes, cars, firstDriverDetails] = await Promise.all([
      getDirections([...normalizedAddresses]),
      getNearByCars([...normalizedAddresses], redis),
      getNearByDriverDetails([...normalizedAddresses]),
    ]);
    if (!routes) {
      return error(400, { success: false, message: "Route not available." });
    }

    // 3) Compute distance/duration
    const legs = routes[0]?.legs || [];
    const distance = legs.reduce((prev: number, curr: any) => prev + (curr?.distance?.value || 0), 0);
    const duration = legs.reduce((prev: number, curr: any) => prev + (curr?.duration?.value || 0), 0);

    if (distance < 50 && duration < 30) {
      return error(400, { success: false, message: "Pickup and drop-off location are too close" });
    }

    // 4) Prepare base trip details
    const km = parseFloat((distance / 1000).toFixed(1));
    const tripDetails: any = {
      forDemo: false,
      km,
      kmText: `${km} km`,
      durationText: `${Math.round(duration / 60)} mins`,
      duration: Math.round(duration / 60),
      firstDriverDetails,
      cars: (cars || [])
        .filter((item: any) => item?.location?.coordinates && item?.location?.coordinates != 0)
        .map((item: any) => ({
          heading: item.heading,
          lat: item?.location?.coordinates[1],
          long: item?.location?.coordinates[0],
        })),
    };

    // 5) Fetch heavy dependencies in parallel
    // const [vehicles, countRides] = await Promise.all([
    //   vehicleTypeModel.find().sort({ priority: 1 }).lean(),
    //   rideBookingsModel.countDocuments({ customer: request?.user?._id }),
    // ]);

    const vehicles = await vehicleTypeModel.find().sort({ priority: 1 }).lean();



    // 6) Coupon resolution
    // If coupon provided explicitly
    if (typeof body?.coupon !== "undefined" && body.coupon.length !== 0) {
      const couponDetails = await couponsModel.findOne({
        code: body?.coupon,
        validFor: "allUsers",
        status: true,
      });
      if (couponDetails) {
        if (couponDetails.expiredAt && couponDetails.expiredAt < new Date()) {
          tripDetails.coupon = {
            code: body?.coupon,
            discount: 0,
            discountType: "",
            isApplied: false,
            message: "Coupon expired",
          };
        } else {
          tripDetails.coupon = {
            id: couponDetails._id,
            code: body?.coupon,
            discount: couponDetails.discountAmount,
            discountType: couponDetails.discountType,
            uptoAmount: couponDetails.uptoAmount,
            isApplied: true,
          };
        }
      } else {
        tripDetails.coupon = {
          code: body?.coupon,
          discount: 0,
          discountType: "",
          isApplied: false,
        };
      }
    } else {
      // Auto-apply coupon for all users
      if (request?.user?.rideCount === 0) {
        const autoCoupon = await couponsModel.aggregate([
          {
            $match: {
              autoApply: true,
              validFor: "allUsers",
              status: true,
              $or: [{ userId: { $exists: true, $eq: request?.user?._id } }, { userId: null }],
              expiredAt: { $gte: new Date() },
            },
          },
          {
            $addFields: {
              remainingUsage: {
                $cond: [
                  { $ne: ["$userId", null] },
                  { $subtract: ["$usageLimit", "$usedCount"] },
                  null,
                ],
              },
            },
          },
          {
            $match: {
              $or: [{ remainingUsage: { $gt: 0 } }, { remainingUsage: null }],
            },
          },
          { $sort: { createdAt: -1, validFor: 1 } },
          { $limit: 1 },
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
        const autoCoupon = await couponsModel
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

      // Auto-apply coupon for new users
      const newUserAutoCoupon = await couponsModel.aggregate([
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
        { $addFields: { usageRemaining: { $subtract: ["$usageLimit", "$usedCount"] } } },
        { $match: { usageRemaining: { $gt: 0 } } },
        { $sort: { createdAt: -1, validFor: 1 } },
        { $limit: 1 },
      ]);
      if (newUserAutoCoupon.length > 0) {
        tripDetails.coupon = {
          id: newUserAutoCoupon[0]._id,
          code: newUserAutoCoupon[0].code,
          discount: newUserAutoCoupon[0].discountAmount,
          discountType: newUserAutoCoupon[0].discountType,
          uptoAmount: newUserAutoCoupon[0].uptoAmount,
          isApplied: true,
        };
      }
    }

    // 7) Surge drivers + weather (in parallel)
    const [weather, activeDrivers] = await Promise.all([
      getWeatherDetails(normalizedAddresses[0]?.location?.latitude, normalizedAddresses[0]?.location?.longitude),
      activeBookingsToActiveDrivers(
        normalizedAddresses[0]?.location?.latitude,
        normalizedAddresses[0]?.location?.longitude
      ),
    ]);

    const netSurge =
      Number(Number(activeDrivers?.surgeMultiplier || 1).toFixed(1)) +
      Number(Number(weather?.underSurge?.toFixed(1)));

    // Build quick lookup for first car per vehicle type
    const carsByVehicle = new Map<string, any[]>();
    (cars || []).forEach((res: any) => {
      const key = res?.vehicleType?.toString?.() || "";
      if (!key) return;
      const list = carsByVehicle.get(key) || [];
      list.push(res);
      carsByVehicle.set(key, list);
    });

    // 8) Compute vehicle prices
    tripDetails.vehicles = (vehicles || []).map((vehicle: any) => {
      const firstCarList =
        carsByVehicle.get(vehicle._id?.toString?.() || "") || [];

      const priced = calcVehiclePrice(
        tripDetails,
        vehicle,
        normalizedAddresses.length - 2,
        body?.rideWhen,
        netSurge,
        weather
      );

      return {
        ...priced,
        carDuration: parseFloat((((firstCarList?.[0]?.distance || 0) / 1000) as number).toFixed(2)),
        isAvailable: firstCarList.length !== 0,
      };
    });

    // 9) Persist pricing list in batch, maintain order
    if (tripDetails.vehicles.length > 0) {
      const docs = tripDetails.vehicles.map((v: any) => ({
        customer: request?.user?._id,
        vehicleType: v,
      }));
      const created = await pricingForUserModel.insertMany(docs, { ordered: true });
      tripDetails.vehicles = tripDetails.vehicles.map((v: any, idx: number) => ({
        ...v,
        pricingModalId: created[idx]?._id,
      }));
    }

    return { success: true, data: tripDetails };
  } catch (e) {
    return error(400, { success: false, message: "Route not availables" });
  }
};

// ...existing code...

const calcVehiclePrice = (
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
  const perTime = tripDetails.duration * vehicle.perMinPricing;

  // (base fare + km + time ) + 10% booking fee min 1$ max 5$
  const vehiclePrice = Math.max(
    vehicle.basePrice + vehicle.perKmPricing * tripDetails.km + perTime,
    vehicle.minimumFare
  ) + stopPointCharges + Number(Number(Math.random() * 0.2).toFixed(2));
  // console.log("vehiclePrice", vehiclePrice);
  // console.log("perTime", perTime);
  // console.log("tripDetails.duration", tripDetails.duration);
  // console.log("vehicle.perMinPricing", vehicle.perMinPricing);
  // console.log("vehicle.perKmPricing", vehicle.perKmPricing);
  // console.log("tripDetails.km", tripDetails.km);
  // console.log("vehicle.basePrice", vehicle.basePrice);
  // console.log("vehicle.minimumFare", vehicle.minimumFare);
  // console.log("stopPointCharges", stopPointCharges);

  let surgeCharge = 0;
  if (surgeValue > 1.2) {
    surgeCharge = Number(Number(vehiclePrice * (surgeValue - 1)).toFixed(2));
  }

  let forReservationPrice = { price: 0, tax: 0 };
  if (rideWhen === "LATER") {
    forReservationPrice.price = 3;
    forReservationPrice.tax = forReservationPrice.price * 0.15;
  }

  const bookingFee = Math.min(Math.max(vehiclePrice * 0.1, 1), 5);
  const operatingFee = vehiclePrice * 0.01;

  const totalPrice =
    vehiclePrice + bookingFee + operatingFee + forReservationPrice.price + surgeCharge;
  let tax = totalPrice * 0.15;

  let vehicleDiscountedPrice = totalPrice + tax;
  if (typeof tripDetails?.coupon !== "undefined" && tripDetails.coupon.isApplied) {
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
    const newTotal = vehicleDiscountedPrice + bookingFee + operatingFee + forReservationPrice.price + surgeCharge;
    tax = newTotal * 0.15;
    vehicleDiscountedPrice = newTotal + tax;
  }

  const pricing = [
    { name: "Fare", price: parseFloat(vehiclePrice?.toFixed(2)) },
    { name: "Booking Fee", price: parseFloat(bookingFee?.toFixed(2)) },
    { name: "Operating Fee", price: parseFloat(operatingFee?.toFixed(2)) },
    { name: "Reservation Fee", price: parseFloat(forReservationPrice?.price?.toFixed(2)) },
    { name: "Surge Charge", price: parseFloat(surgeCharge?.toFixed(2)) },
    { name: "Tax", price: parseFloat(tax?.toFixed(2)) },
  ];

  if (typeof tripDetails?.coupon !== "undefined" && tripDetails.coupon.isApplied) {
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
    surgeCharge,
    surgeValue,
    weatherSurge,
    vehiclePrice: parseFloat(vehiclePrice?.toFixed(2)),
    subTotal: parseFloat(totalPrice?.toFixed(2)),
    price: parseFloat((totalPrice + tax)?.toFixed(2)),
    operatingFee: parseFloat(operatingFee?.toFixed(2)),
    bookingFee: parseFloat(bookingFee?.toFixed(2)),
    discount: vehicleDiscountedPrice,
    forReservationPrice,
    pricing,
    tax: { percentage: 15, taxTotal: parseFloat(tax?.toFixed(2)) },
    discountObject: { ...tripDetails.coupon },
    km: tripDetails.km,
    kmText: tripDetails.kmText,
    durationText: tripDetails.durationText,
    duration: tripDetails.duration,
  };
};

function calculateDiscount(originalAmount: number, discountType: string, discountValue: number, cap: number) {
  let discountAmount = 0;
  if (discountType === "percentage") discountAmount = (originalAmount * discountValue) / 100;
  else if (discountType === "flat") discountAmount = discountValue;
  else throw new Error('Invalid discount type. Use "percentage" or "flat".');

  if (cap && discountAmount > cap) discountAmount = cap;
  const finalAmount = originalAmount - discountAmount;
  return Math.max(finalAmount, 0);
}
// ...existing