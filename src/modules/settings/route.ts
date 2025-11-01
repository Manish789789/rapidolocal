import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect";
import * as controller from "./controllers/admin/settings.controller";
import * as userAppController from "./controllers/user-app/settings.controller";
import { userAuthProtect } from "../users/middleware/userAuth.protect";

export default function (router: any) {
    return router.group('/admin/settings', (admin: any) =>
        admin.guard({
            beforeHandle(ctx: any) {
                return adminAuthProtect(ctx)
            },
        })
            .get('/:settingField', controller.getSettings)
            .post('/:settingField', controller.updateSettings)
    )
        .group("/user-app", (user: any) =>
            user.guard({
                beforeHandle(ctx: any) {
                    return userAuthProtect(ctx)
                }, detail: {
                    tags: ['User App - Settings'],
                    description: 'User App Settings',
                }
            })
                .get("/settings", userAppController.getSettings)
                .post("/homeBannerCards", userAppController.homeBannerCards)
        )
}