import {
  forgotPasswordValidator,
  loginValidator,
  updateForgotPasswordValidator,
} from "./middleware/admin.validator";
import { adminAuthProtect } from "./middleware/adminAuthProtect";
import * as adminAuthController from "./controllers/admin/adminAuth.controller";
import * as staffController from "./controllers/admin/staff.controller";
import * as rolesController from "./controllers/admin/roles.controller";
import { decryptPassword } from "./middleware/admin.helper";
import { createStaffValidator } from "./middleware/staff.validator";
import { customePayoutHandler } from "./controllers/admin/customPayoutHandler.controller";
import { payoutbycsv } from "./controllers/admin/customPayoutHandler.controller";
import { encryptPassword } from "../rbcBank/helper";

export default function (router: any) {
  return router.group("/admin", (admin: any) =>
    admin
      .onTransform(function log(ctx: any) {
        return decryptPassword(ctx);
      })
      .group("/auth", (auth: any) =>
        auth
          .post("/login", adminAuthController.login, {
            body: loginValidator,
          })
          .post("/forgot-password", adminAuthController.forgotPassword, {
            body: forgotPasswordValidator,
          })
          .post(
            "/updateForgotPassword",
            adminAuthController.updateForgotPassword,
            {
              body: updateForgotPasswordValidator,
            }
          )
      )
      .guard({
        beforeHandle(ctx: any) {
          return adminAuthProtect(ctx);
        },
      })
      .get("/me", adminAuthController.myProfile)
      .group("/roles", (auth: any) =>
        auth
          .post("/", rolesController.index)
          .post("/create", rolesController.create)
          .get("/:id", rolesController.edit)
          .post("/:id/update", rolesController.update)
          .get("/:id/delete", rolesController.deleteItem)
      )
      .group("/staff", (auth: any) =>
        auth
          .post("/", staffController.index)
          .post("/create", staffController.create, {
            body: createStaffValidator,
          })
          .get("/:id", staffController.edit)
          .post("/:id/update", staffController.update, {
            async beforeHandle(ctx: any) {
              ctx.body.password = await Bun.password.hash(ctx.body.password, {
                algorithm: "bcrypt",
                cost: 4,
              });
            },
          })
          .get("/:id/delete", staffController.deleteItem)
      )

      .post("/custom/payout", customePayoutHandler)
      .get("/custom/payoutbycsv", payoutbycsv)
  );
}
