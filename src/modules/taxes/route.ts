import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as controller from "./controllers/admin/taxes.controller";
import { createSetings } from "./middleware/taxes.validator";

export default function (router: any) {
    return router.group('/admin/taxes', (admin: any) =>
        admin.guard({
            beforeHandle(ctx: any) {
                return adminAuthProtect(ctx)
            },
        })
            .post('/', controller.index)
            .post('/create', controller.create, { body: createSetings })
            .get('/:id', controller.edit)
            .post('/:id/update', controller.update, { body: createSetings })
            .get('/:id/delete', controller.deleteItem)
    )
}