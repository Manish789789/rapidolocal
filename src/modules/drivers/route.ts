import { create } from "./../users/controllers/user-app/shortcut.controller";
import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as driversController from "./controllers/admin/drivers.controller";
import * as withdrawalsController from "./controllers/admin/withdrawals";
import * as vehicleTypesController from "./controllers/admin/vehicleTypes.controller";
import * as driverManageController from "./controllers/driver-app/driver.controller";
import * as mediaManageController from "./controllers/driver-app/media.controller";
import * as walletTransactionsController from "./controllers/admin/walletTransactions.controller";
import * as driverformController from "../formsubmission/controllers/drivers/form.controller";
import * as driverInformationController from "../drivers/controllers/driver-app/vehicalInformation.ts";
import {
  loginValidator,
  validateCountryCode,
  validateCountryName,
  validateOtp,
  validatePhone,
} from "./middleware/auth.validator";
import { driverAuthProtect } from "./middleware/driverAuth.protect";
import { TransferMoneyByStripe } from "../paymentGateways/stripe.controller";

export default function (router: any) {
  return router
    .group("/admin", (admin: any) =>
      admin
        .guard({
          beforeHandle(ctx: any) {
            return adminAuthProtect(ctx);
          },
        })
        .group("/drivers", (route: any) =>
          route
            .post("/", driversController.index)
            .post("/create", driversController.create)
            .get("/:id", driversController.edit)
            .get("/:id/block", driversController.block)
            .get("/:id/unblock", driversController.unBlock)
            .post("/:id/addMoney", driversController.addMoney)
            .post("/:id/deductMoney", driversController.deductMoney)
            .post("/:id/update", driversController.update)
            .get("/:id/delete", driversController.deleteItem)
            .post("/delete", driversController.multiDeleteItem)
            .get("/:id/analytics", driversController.analytics)
            .get("/:id/approve", driversController.approve)
            .get("/:id/unapprove", driversController.unapprove)
            .post("/get-csv", driversController.getDriversCsv)
            .post("/:id/colorChange", driversController.colorChange)
            .post("/:id/documentUpload", driversController.documentUpload)
            .post(
              "/:id/earningReportByWeek",
              driversController.earningReportByWeek
            )
            .get("/:id/taxInfoListing", driversController.taxInfoListing)
            .post("/:id/taxInfo", driversController.taxInfo)
            .post("/get-csv", driversController.getDriversCsv)
            .post("/getDrivers", driversController.getDrivers)
            .post("/:id/onlineStatus", driversController.onlineStatus)
            .get("/autoPayout", driversController.autoPayout)
            .post(
              "/:id/documentVerificationAI",
              driversController.documentVerificationAI
            )
        )
        .group("/wallet-transactions", (route: any) =>
          route.post("/", walletTransactionsController.index)
        )
        .group("/withdrawals", (route: any) =>
          route.post("/", withdrawalsController.index)
        )
        .group("/payouts/custom", (route: any) =>
          route.post("/", TransferMoneyByStripe)
        )
        .group("/vehicle-types", (route: any) =>
          route
            .post("/", vehicleTypesController.index)
            .post("/create", vehicleTypesController.create)
            .get("/:id", vehicleTypesController.edit)
            .post("/:id/update", vehicleTypesController.update)
            .get("/:id/delete", vehicleTypesController.deleteItem)
            .post("/delete", vehicleTypesController.multiDeleteItem)
        )
    )
    .group("/driver-app/drivers", (users: any) =>
      users
        .get("/getDocumentVerification/:id", driverManageController.documentVerification)
        .group("/auth", (auth: any) =>
          auth
            .guard({
              detail: {
                tags: ["Driver App - Auth"],
                description: "Driver App Login or Register",
              },
            })
            .post("/loginOrRegister", driverManageController.loginOrRegister, {
              async beforeHandle(ctx: any) {
                if (ctx.body?.phone) {
                  await validatePhone(ctx);
                }
                if (ctx.body?.otp) {
                  await validateOtp(ctx);
                }
                if (ctx.body?.countryName) {
                  await validateCountryName(ctx);
                }
                if (ctx.body?.countryCode) {
                  await validateCountryCode(ctx);
                }
              },
              body: loginValidator,
            })
        )
        .guard({
          beforeHandle(ctx: any) {
            return driverAuthProtect(ctx);
          },
          detail: {
            tags: ["Driver App - Profile"],
            description: "Driver App Profile Update",
          },
        })
        .get("/logout", driverManageController.logout)
        .get("/myProfile", driverManageController.driverProfile)
        .post("/updateFcmToken", driverManageController.updateFcmToken)
        .post("/updateProfile", driverManageController.updateProfile)
        .get("/legalAgreement", driverManageController.legalAgreement)
        .get("/backgroundCheckText", driverManageController.backgroundCheckText)
        .get("/driverAbstractText", driverManageController.driverAbstractText)
        .post("/sendAndConfirmOtp", driverManageController.sendAndConfirmOtp, {
          async beforeHandle(ctx: any) {
            if (ctx.body?.phone) {
              await validatePhone(ctx);
            }
            if (ctx.body?.otp) {
              await validateOtp(ctx);
            }
            if (ctx.body?.countryName) {
              await validateCountryName(ctx);
            }
            if (ctx.body?.countryCode) {
              await validateCountryCode(ctx);
            }
          },
          body: loginValidator,
        })
        .post("/media/upload", mediaManageController.uploadMedia)
        .post(
          "/driverWalletTransaction/todayAnalytics",
          driverManageController.todayAnalytics
        )
        .post(
          "/driverWalletTransaction/earningReport",
          driverManageController.earningReport
        )
        .post(
          "/driverWalletTransaction/earningReportByWeek",
          driverManageController.earningReportByWeek
        )
        .get(
          "/driverWalletWithdraws/paymentDetails",
          driverManageController.paymentDetails
        )
        .post("/onlineStatus", driverManageController.onlineStatus)
        .post("/updateLocation", driverManageController.updateLocation)
        .post("/updateDeviceInfo", driverManageController.updateDeviceInfo)
        .get("/deleteProfile", driverManageController.deleteProfile)
        .get("/taxInfoListing", driverManageController.taxInfoListing)
        .post("/taxInfo", driverManageController.taxInfo)
        .post("/taxProfileForm", driverManageController.taxProfileForm)
        .group("/vehicalInformation", (route: any) =>
          route
            .get("/", driverInformationController.index)
            .post("/create", driverInformationController.create)
            .get("/:id", driverInformationController.edit)
            .post("/:id/update", driverInformationController.update)
            .get("/:id/delete", driverInformationController.deleteItem)
        )
        .get("/getUpdateLocation", driverManageController.getUpdateLocation)
        .post("/formList", driverManageController.formList)
    );
}
