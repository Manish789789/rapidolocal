import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import { userAuthProtect } from "../users/middleware/userAuth.protect";
import * as userAppController from "./controllers/user-app/places.controller";
import { placesValidator, validateLatLong } from "./middlewares/places.validator";

export default function (router: any) {
    return router
        .group('/admin/places', (admin: any) =>
            admin.guard({
                beforeHandle(ctx: any) {
                    return adminAuthProtect(ctx)
                },
            })
            // .post('/', controller.index)
            // .post('/create', controller.create)
            // .get('/:id', controller.edit)
            // .post('/:id/update', controller.update)
            // .get('/:id/delete', controller.deleteItem)
            // .post('/get-csv', controller.getRidesCsv)
        )
        .group("/user-app/places", (user: any) =>
            user.guard({
                beforeHandle(ctx: any) {
                    return userAuthProtect(ctx)
                }, detail: {
                    tags: ['User App - Places'],
                    description: 'User App Places',
                }
            })
                .post("/getAddressWithLatLong", userAppController.getAdressWithLatLong, {
                    async beforeHandle(ctx: any) {
                        await validateLatLong(ctx)
                    },
                    body: placesValidator,
                })
                .get("/autoComplete", userAppController.autoComplete)
                .get("/autoComplete/:id", userAppController.getLatLongByPlaceId)
                .post("/getDirectionOnMap", userAppController.getDirectionOnMap)
        )
}



