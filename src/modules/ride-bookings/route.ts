import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import { userAuthProtect } from "../users/middleware/userAuth.protect";
import * as controller from "./controllers/admin/rideBookings.controller";
import * as rideBookingsModelController from "./controllers/user-app/rideBookings.controller";
import * as rideBookingsModelDriverController from "./controllers/driver-app/rideBooking.controller";
import * as rideBookingValidator from "./middleware/rideBooking.validator";
import { driverAuthProtect } from "../drivers/middleware/driverAuth.protect";
import * as phoneCallController from "./controllers/phone-call/phoneCall.controller";
import "../../utils/cronJob";
import twilio from "twilio";
import { Elysia } from "elysia";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);
const twilioNumber = process.env.TWILIO_NUMBER!;
const serverUrl = "https://82605bcbb48d.ngrok-free.app";
export default function (router: any) {
  return router
    .group("/admin/ride-bookings", (admin: any) =>
      admin
        .guard({
          beforeHandle(ctx: any) {
            return adminAuthProtect(ctx);
          },
        })
        .post("/", controller.index)
        .post("/create", controller.create)
        .get("/:id", controller.edit)
        .post("/:id/update", controller.update)
        .get("/:id/delete", controller.deleteItem)
        .post("/get-csv", controller.getRidesCsv)
        .post("/:id/trip-status", controller.tripStatusChange)
        .post("/invoiceRideBooking", controller.invoiceRideBooking)
        .post("/:id/refundWaitingCharges", controller.refundWaitingCharges)
        .post("/:id/refundCancelCharges", controller.refundCancelCharges)
        .post("/:id/adminCalculatePrice", controller.calculateAdminVehiclePrice)
        .post("/:id/updateAddress", controller.updateAddress)
        .post("/:id/assignDriver", controller.assignDriver)
        .post("/count", controller.countRideBookingDetails)
    )
    .group("/user-app/ride-bookings", (user: any) =>
      user
        .guard({
          beforeHandle(ctx: any) {
            return userAuthProtect(ctx);
          },
          detail: {
            tags: ["User App - Bookings"],
            description: "User App Bookings",
          },
        })
        .get(
          "/getCurrentActiveBooking",
          rideBookingsModelController.getActiveBooking
        )
        .post("/nearByCars", rideBookingsModelController.nearByCars, {
          body: rideBookingValidator.nearByCars,
        })
        .get(
          "/checkLastCompleteDrive",
          rideBookingsModelController.checkLastActiveBooking
        )
        .post("/pricing", rideBookingsModelController.calculatePrice)

        .post("/updateRideAdress", controller.updateRideAddress)

        .post("/placeBooking", rideBookingsModelController.placeBooking, {
          body: rideBookingValidator.placeBooking,
        })
        .post("/myBookings", rideBookingsModelController.mybookings)
        .get("/booking/:id", rideBookingsModelController.singleBookingData)
        // .post("/booking", rideBookingsModelController.index)
        .post("/invoiceBooking", rideBookingsModelController.invoiceRideBooking)
        .post("/cancelBooking/:id", rideBookingsModelController.cancelBooking, {
          body: rideBookingValidator.cancelBookingByUser,
          params: rideBookingValidator.idChecker,
        })
        .post(
          "/shareLiveLocation",
          rideBookingsModelController.shareLiveLocation
        )
        .post("/tipToDriver", rideBookingsModelController.tipToDriver)
        .post("/ratingToDriver", rideBookingsModelController.ratingToDriver)
        .post("/sosCall", rideBookingsModelController.sosCall)
        .post("/lostItemBooking", rideBookingsModelController.lostItemBooking)
        .post("/callCreation", rideBookingsModelController.callCreationTwillo)
        .get("/bookingChat/:id", rideBookingsModelController.bookingChat)
    )
    .group("/driver-app/ride-bookings", (user: any) =>
      user
        .guard({
          beforeHandle(ctx: any) {
            return driverAuthProtect(ctx);
          },
          detail: {
            tags: ["Driver App - Bookings"],
            description: "Driver App Bookings",
          },
        })
        .get(
          "/getCurrentActiveBooking",
          rideBookingsModelDriverController.getCurrentActiveBooking
        )
        .get(
          "/checkNewBooking",
          rideBookingsModelDriverController.checkDriverNewBooking
        )
        .post(
          "/matchedBookings",
          rideBookingsModelDriverController.getMatchedBooking
        )
        .post("/myBookings", rideBookingsModelDriverController.mybookings)
        .post(
          "/callCreation",
          rideBookingsModelDriverController.callCreationTwillo
        )
        .get(
          "/acceptNewBooking/:id",
          rideBookingsModelDriverController.acceptNewBooking
        )
        .get(
          "/declineNewJobRequest/:id",
          rideBookingsModelDriverController.declineNewJobRequest
        )
        .get(
          "/startScheduleBooking/:id",
          rideBookingsModelDriverController.startScheduleBooking
        )
        .get(
          "/bookingDetails/:id",
          rideBookingsModelDriverController.bookingDetails
        )
        .get("/bookingChat/:id", rideBookingsModelDriverController.bookingChat)
        .post(
          "/cancelBooking/:id",
          rideBookingsModelDriverController.cancelledByDriverBooking,
          {
            body: rideBookingValidator.cancelBookingByUser,
            params: rideBookingValidator.idChecker,
          }
        )
        .post(
          "/updateBookingStatus",
          rideBookingsModelDriverController.updateBookingStatus,
          {
            body: rideBookingValidator.updateBookingStatus,
          }
        )
        .post("/ratingToUser", rideBookingsModelDriverController.ratingToUser)
        .post("/sendTipThanks", rideBookingsModelDriverController.tipThanks)
        .post(
          "/updateWayPointBookingStatus",
          rideBookingsModelDriverController.updateCabBookingWayPointStatus
        )
        .get("/poolDetails/:id", rideBookingsModelDriverController.poolDetails)
        .get(
          "/onlyPoolDetails/:id",
          rideBookingsModelDriverController.OnlyPoolDetails
        )
        .post(
          "/updatePoolDetails",
          rideBookingsModelDriverController.updatePool
        )
    )

    .post("/create-call", phoneCallController.callCreationTwillo) // triggered by app
    .post("/connect", phoneCallController.inboundCallHandler)
    .post("/call-status", phoneCallController.callStatusHandler);
}
