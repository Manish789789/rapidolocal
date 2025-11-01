import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as controller from "./controllers/admin/pricing.controller";
import * as userAppController from "./controllers/user-app/pricing.controller";
import { createPricing, servicesSearchValidator } from "./middleware/pricing.validator";

export default function (router: any) {
    return router.group('/admin/pricing', (admin: any) =>
        admin.guard({
            beforeHandle(ctx: any) {
                return adminAuthProtect(ctx)
            },
        })
            .post('/', controller.index)
            .get("/services", controller.services, { query: servicesSearchValidator })
            .post('/create', controller.create, { body: createPricing })
            .get('/:id', controller.edit)
            .post('/:id/update', controller.update, { body: createPricing })
            .get('/:id/delete', controller.deleteItem)
    )
        .group('/user-app', (admin: any) =>
            admin
                // .guard({
                //         beforeHandle(ctx: any) {
                //             return adminAuthProtect(ctx)
                //         },
                //     })
                .post('/pricing', userAppController.calculatePrice)
        )


}