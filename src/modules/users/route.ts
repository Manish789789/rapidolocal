import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as userAdminController from "./controllers/admin/users.controller";
import * as userAppController from "./controllers/user-app/user.controller";
import * as shortcutController from "./controllers/user-app/shortcut.controller";
import * as businessProfileController from "./controllers/user-app/businessProfile.controller";
import * as paymentMethodController from "./controllers/user-app/paymentMethod.controller";
import * as adminpaymentMethodController from "./controllers/admin/paymentmethod.controller";
import * as squarePaymentGatewayController from "../paymentGateways/square.controller";
import * as stripePaymentGatewayController from "../paymentGateways/stripe.controller";
import * as userAuthController from "./controllers/user-app/userAuth.controller";
import * as walletTransactionsController from "./controllers/admin/walletTransactions.controller";
import * as mediaManageUserController from "./controllers/user-app/media.controller";
import {
  loginValidator,
  validateCountryCode,
  validateCountryName,
  validateOtp,
  validatePhone,
} from "./middleware/auth.validator";
import { userAuthProtect } from "./middleware/userAuth.protect";
import {
  fcmValidator,
  userProfileUpdateValidator,
} from "./middleware/user.validator";

export default function (router: any) {
  return router
    .group("/admin", (admin: any) =>
      admin
        .guard({
          beforeHandle(ctx: any) {
            return adminAuthProtect(ctx);
          },
        })
        .group("/users", (route: any) =>
          route
            .post("/", userAdminController.index)
            .post("/create", userAdminController.create)
            .get("/:id", userAdminController.edit)
            .get("/:id/block", userAdminController.block)
            .get("/:id/unblock", userAdminController.unBlock)
            .post("/:id/addMoney", userAdminController.addMoney)
            .post("/:id/deductMoney", userAdminController.deductMoney)
            .post("/:id/update", userAdminController.update)
            .get("/:id/delete", userAdminController.deleteItem)
            .post("/delete", userAdminController.multiDeleteItem)
            .get("/:id/analytics", userAdminController.analytics)
            .post("/paymentMethods", adminpaymentMethodController.index)
            .post("/:id/driverunblock", userAdminController.driverUnblock)
            .post("/:id/adddriverblock", userAdminController.addDriverBlock)
            .post("/get-csv", userAdminController.getDriversCsv)
        )
        .group("/users/wallet-transactions", (route: any) =>
          route
            .post("/", walletTransactionsController.index)
            .post("/create", walletTransactionsController.create)
        )
    )
    .group("/user-app/users", (users: any) =>
      users
        .group("/auth", (auth: any) =>
          auth
            .guard({
              detail: {
                tags: ["User App - Auth"],
                description: "User App Login or Register",
              },
            })
            .post("/loginOrRegister", userAuthController.loginOrRegister, {
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
            .post("/eventListen", userAuthController.eventListen)
        )
        .guard({
          beforeHandle(ctx: any) {
            return userAuthProtect(ctx);
          },
          detail: {
            tags: ["User App - Profile"],
            description: "User App Profile Update",
          },
        })
        .get("/logout", userAuthController.logout)
        .get("/myProfile", userAppController.myProfile)
        .post("/media/upload", mediaManageUserController.uploadMedia)
        .post("/updateFcmToken", userAppController.updateFcmToken, {
          body: fcmValidator,
        })
        .post("/updateProfile", userAppController.updateProfile, {
          async beforeHandle(ctx: any) {
            if (ctx.body?.phone) {
              await validatePhone(ctx);
            }
            if (ctx.body?.otp) {
              await validateOtp(ctx);
            }
          },
          body: userProfileUpdateValidator,
        })
        .get("/updateLastActive", userAppController.updateLastActive)
        .get("/deleteProfile", userAppController.deleteprofile)
        .post("/invitedUsers", userAppController.fetchInvitedUsers)
        .post("/updateDeviceInfo", userAppController.updateDeviceInfo)
        .post("/updateLocation", userAppController.updateLocation)
    )
    .group("/user-app/shortcuts", (auth: any) =>
      auth
        .guard({
          beforeHandle(ctx: any) {
            return userAuthProtect(ctx);
          },
          detail: {
            tags: ["User App - Shortcuts"],
            description: "User App Shortcuts",
          },
        })
        .post("/", shortcutController.index)
        .post("/create", shortcutController.create)
        .get("/:id", shortcutController.edit)
        .post("/:id/update", shortcutController.update)
        .get("/:id/delete", shortcutController.deleteItem)
    )
    .group("/user-app/paymentMethods", (auth: any) =>
      auth
        .guard({
          beforeHandle(ctx: any) {
            return userAuthProtect(ctx);
          },
          detail: {
            tags: ["User App - Payment methods"],
            description: "User App Payment methods",
          },
        })
        .post("/", paymentMethodController.index)
        .post("/addcash", paymentMethodController.addcash)
        .post("/create", paymentMethodController.create)
        .get("/:id/update", paymentMethodController.update)
        .get("/:id/delete", paymentMethodController.deleteItem)
        .post("/:id", paymentMethodController.edit)
    )
    .group("/user-app/paymentMethods", (auth: any) =>
      auth
        .guard({
          detail: {
            tags: ["User App - Payment methods Webhook"],
            description: "User App Payment methods Webhook",
          },
        })
        .post("/webhook", stripePaymentGatewayController.stripeWebhook)
        .post("/squareWebhook", squarePaymentGatewayController.squareWebhook)
    )
    .group("/user-app/businessProfiles", (auth: any) =>
      auth
        .guard({
          beforeHandle(ctx: any) {
            return userAuthProtect(ctx);
          },
          detail: {
            tags: ["User App - Business Profile"],
            description: "User App Business Profile",
          },
        })
        .post("/", businessProfileController.index)
        .post("/create", businessProfileController.create)
        .post("/:id", businessProfileController.edit)
        .post("/:id/update", businessProfileController.update)
        .get("/:id/delete", businessProfileController.deleteItem)
    );
  // .group('/users', (route: any) =>
  //     route.post('/', userController.index)
  //         .post('/create', userController.create)
  //         .get('/:id', userController.edit)
  //         .get('/:id/block', userController.block)
  //         .get('/:id/unblock', userController.unBlock)
  //         .post('/:id/addMoney', userController.addMoney)
  //         .post('/:id/update', userController.update)
  //         .get('/:id/delete', userController.deleteItem)

  // )
  // .group('/users/wallet-transactions', (route: any) =>
  //     route.post('/', walletTransactionsController.index)
  // )
}
