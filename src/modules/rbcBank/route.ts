import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
// import { driverAuthProtect } from "@/modules/drivers/middleware/driverAuth.protect";
// import {
//   doPayoutByRBC,
//   customePayoutByRBC,
//   saveDriverUnPaidDataToCsvOnWeekEnd,
// } from "./helper";
// import driversWithdrawalModel from "@/modules/drivers/models/driversWithdrawal.model";
// import driversModel from "@/modules/drivers/models/drivers.model";
// import { TransferMoneyByStripe } from "../paymentGateways/stripe.controller";

// export default function (router: any) {
//   return router
//     // Admin routes
//     .group("/admin/payouts", (admin: any) =>
//       admin
//         .guard({
//           beforeHandle(ctx: any) {
//             return adminAuthProtect(ctx);
//           },
//           detail: {
//             tags: ["Admin - Payouts"],
//             description: "Routes for triggering and exporting driver payouts",
//           },
//         })
//         .post("/run", async (ctx: any) => {
//           await doPayoutByRBC();
//           ctx.body = { success: true, message: "Payout completed." };
//         })
//         .post("/custom", (route: any) => {
//         //   const { driverIds } = ctx.request.body;
//         //   if (!Array.isArray(driverIds) || driverIds.length === 0) {
//         //     ctx.throw(400, "driverIds must be a non-empty array.");
//         //   }
//         //   await customePayoutByRBC(driverIds);
//         //   ctx.body = { success: true, message: "Custom payout completed." };
//         route.post("/", customePayoutByRBC)
//         })
//         .post("/export-unpaid", async (ctx: any) => {
//           const unpaidDrivers = await driversModel
//             .find({
//               wallet: { $gte: 1 },
//               "bankDetails": { $exists: true },
//               "vehicleInfo.isApproved": true,
//             })
//             .lean();

//           unpaidDrivers.forEach(driver => {
//             saveDriverUnPaidDataToCsvOnWeekEnd({
//               driverId: driver._id,
//               fullName: driver.fullName,
//               email: driver.email,
//               phone: driver.phone,
//               amount: driver.wallet,
//             });
//           });

//           ctx.body = { success: true, message: "CSV exported successfully." };
//         })
//     )

//     // Driver routes
//     .group("/driver-app/payouts", (driver: any) =>
//       driver
//         .guard({
//           beforeHandle(ctx: any) {
//             return driverAuthProtect(ctx);
//           },
//           detail: {
//             tags: ["Driver App - Payouts"],
//             description: "Driver payout and earnings history",
//           },
//         })
//         .get("/history", async (ctx: any) => {
//           const driverId = ctx.user._id; // assuming auth sets ctx.user
//           const payouts = await driversWithdrawalModel
//             .find({ driver: driverId })
//             .sort({ txnTime: -1 })
//             .lean();

//           ctx.body = { success: true, payouts };
//         })
//     );
// }
export default function (router: any) {
  return router
    .group("/admin", (admin: any) =>
      admin
        .guard({
          beforeHandle(ctx: any) {
            return adminAuthProtect(ctx);
          },
        })


      // .group("/payouts/custom", (route: any) => route.post("/", TransferMoneyByStripe) )


    )


}

