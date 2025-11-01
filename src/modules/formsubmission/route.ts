import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as formController from "../formsubmission/controllers//admin/form.controller";
export default function (router: any) {
  return router.group("/admin", (admin: any) =>
    admin
      .guard({
        beforeHandle(ctx: any) {
          return adminAuthProtect(ctx);
        },
      })
      .group("/form", (route: any) =>
        route
          .post("/", formController.index)
          .post("/create", formController.create)
          .get("/:id", formController.edit)
          .post("/:id/update", formController.update)
          .get("/:id/delete", formController.deleteItem)
      )
  );
}
