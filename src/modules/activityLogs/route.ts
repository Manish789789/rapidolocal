import { adminAuthProtect } from '@/modules/admins/middleware/adminAuthProtect'
import * as activityLogsController from "./controllers/admin/activityLogs.controller";

export default function (router: any) {
    return router.group('/admin/activityLogs', (admin: any) => {
        admin.guard({
            beforeHandle(ctx: any) {
                return adminAuthProtect(ctx)
            },
        })
            .post("/", activityLogsController.index)

        return admin
    })
}