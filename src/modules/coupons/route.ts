import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as controller from "./controllers/admin/coupons.controller";

export default function (router: any) {
  return router.group("/admin/coupons", (admin: any) => {
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
      .post("/delete", controller.multiDeleteItem);

    return admin;
  });
}
