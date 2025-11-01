import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as controller from "./controllers/admin/geoAreas.controller";
import { geoAreasSearchValidator } from "./middleware/geoAreas.validator";

export default function (router: any) {
  return router.group("/admin/driver-areas", (admin: any) =>
    admin
      .guard({
        beforeHandle(ctx: any) {
          return adminAuthProtect(ctx);
        },
      })
      .post("/", controller.index)
      .get("/search", controller.search, { query: geoAreasSearchValidator })
      .post("/create", controller.create)
      .get("/:id", controller.edit)
      .post("/:id/update", controller.update)
      .get("/:id/delete", controller.deleteItem)
  );
  // .group("/driver-app/surgeGeoAreas", (user: any) =>
  //   user
  //     .guard({
  //       beforeHandle(ctx: any) {
  //         return driverAuthProtect(ctx);
  //       },
  //       detail: {
  //         tags: ["Driver App - Surge Areas"],
  //         description: "Driver App surge areas",
  //       },
  //     })
  //     .post("/surgeZone", driverGeoAreaController.surgeGeoAreas)
  //     .post("/heatMapPoints", driverGeoAreaController.heatMapPoints)
  // );
}
