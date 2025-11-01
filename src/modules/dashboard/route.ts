import { adminAuthProtect } from '@/modules/admins/middleware/adminAuthProtect'
import * as dashboardController from "./controllers/admin/dashboard.controller";

export default function (router: any) {
    return router.group('/admin/dashboard', (admin: any) => {
        admin.guard({
            beforeHandle(ctx: any) {
                return adminAuthProtect(ctx)
            },
        })
        .post("/",dashboardController.index)
        .post("/searchOnSystem",dashboardController.searchOnSystem)
        

        return admin
    })
}