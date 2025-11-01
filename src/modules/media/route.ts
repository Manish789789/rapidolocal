import { adminAuthProtect } from "@/modules/admins/middleware/adminAuthProtect"
import * as controller from "./controllers/media.controller";

export default function (router: any) {
    return router.group('/admin/media', (admin: any) =>
        admin.guard({
            beforeHandle(ctx: any) {
                return adminAuthProtect(ctx)
            },
        })
            .post('/', controller.index)
            .post('/save', controller.uploadAndCreateMedia)
            .post('/deleteByLinks', controller.deleteByLinks)
    )
}


// var storage = multer.memoryStorage();
// // const storage = multer.diskStorage({
// //   filename: (req, file, cb) => {
// //     cb(null, Date.now() + file.originalname)
// //   }
// // })

// var upload = multer({
//   storage: storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10 MB maximum file size
//   }
// });


// root.group('admin/media', mediaRoute => {

//   mediaRoute.use('/', customerAuthProtect)
//   // mediaRoute.use('/save', upload.single("file"))

//   mediaRoute.post('/', mediaController.index);
//   mediaRoute.post('/save', upload.single("file"),mediaController.uploadAndCreateMedia);
//   mediaRoute.post('/upload', upload.single("file"), mediaController.uploadAndCreateMedia);
//   mediaRoute.post('/deleteByLinks', mediaController.deleteByLinks);
// });

// module.exports = root.export();