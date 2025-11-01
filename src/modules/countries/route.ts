import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as countriesController from "./controller/countries.controller";
import * as statesController from "./controller/states.controller";
import * as citiesController from "./controller/cities.controller";
import { stateSearchValidator } from "./middleware/state.validator";

export default function (router: any) {
  return router.group("/admin", (admin: any) =>
    admin
      .guard({
        beforeHandle(ctx: any) {
          return adminAuthProtect(ctx);
        },
      })
      .group("/countries", (route: any) =>
        route
          .post("/", countriesController.index)
          .get("/search", countriesController.search)
          .get("/:id", countriesController.index)
      )
      .group("/cities", (route: any) =>
        route
          .post("/", citiesController.index)
          .get("/:id", citiesController.editId)
      )
      .group("/states", (route: any) =>
        route
          .post("/", statesController.index)
          .get("/search", statesController.search, {
            query: stateSearchValidator,
          })
      )
  );
}
