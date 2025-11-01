import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as controller from "./controllers/admin/geoZones.controller";
import { userAuthProtect } from "../users/middleware/userAuth.protect";
import * as GeoZonesForPickDropController from "./controllers/user-app/geoZones.controller";

export default function (router: any) {
  return router
    .group("/admin/geo-zones", (admin: any) =>
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
        .post("/:id/pdf-download", controller.pdfDownloadRideBooking)
    )
    .group("/user-app/zones", (user: any) =>
      user
        .guard({
          beforeHandle(ctx: any) {
            return userAuthProtect(ctx);
          },
          detail: {
            tags: ["User App - Zones Pick Drop"],
            description: "User App zones pick drop",
          },
        })
        .get(
          "/geoZonesForPickDrop",
          GeoZonesForPickDropController.getGeoZonesForPickDrop
        )
    );
}
