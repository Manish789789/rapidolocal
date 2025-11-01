import { create } from "./modules/users/controllers/user-app/shortcut.controller";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { setHeaders } from "./middlewares/headers";
import jwt from "@elysiajs/jwt";
import { connectToDb } from "./utils/db.config";
import { ip } from "elysia-ip";
import { redisPlugin } from "@/plugins/redis/redis.plugin";
import { redisSubscriberPlugin } from "@/plugins/redis/redis-subscriber.plugin";
import { readdir } from "node:fs/promises";
import { logger } from "@tqman/nice-logger";
import { websocketPlugin } from "@/plugins/websocket/websocket.plugin";
import { geolocationPlugin } from "./plugins/geoLocation/geolocation.plugin";
import { settingsPlugin } from "./plugins/settings/settings.plugin";
import {
  cronPlugin,
  dataMigrate,
  paymentWalletMigrate,
  walletMigrate,
} from "./plugins/cron/cron.plugin";
import {
  setupGracefulShutdown,
  logMemoryUsage,
  globalResourceManager,
} from "./utils/memoryOptimizer";
import {
  doublePaySameJob,
  migrateWalletOfDriver,
  rideCountAggregation,
} from "./utils/redisHelper";
import { sentry } from "elysiajs-sentry";
import {
  createPendingPayout,
  payoutAllPendingDrivers,
} from "./modules/admins/controllers/admin/customPayoutHandler.controller";
import { stripAccountDelete } from "./modules/paymentGateways/stripe.controller";

process.env.TZ = "UTC";
process.env.OPENSSL_CONF = "/dev/null";

// Setup graceful shutdown
setupGracefulShutdown();

// Log memory usage every 5 minutes
setInterval(() => {
  logMemoryUsage("Periodic Memory Check");
}, 5 * 60 * 1000);

const app = new Elysia()
  .use(websocketPlugin)
  // .use(cronPlugin)
  // .use(websocket)
  .use(geolocationPlugin)
  .use(settingsPlugin)
  .use(redisPlugin)
  .use(redisSubscriberPlugin)
  // .use(
  //   swagger({
  //     documentation: {
  //       components: {
  //         securitySchemes: {
  //           bearerAuth: {
  //             type: "http",
  //             scheme: "bearer",
  //             bearerFormat: "JWT",
  //           },
  //         },
  //       },
  //       tags: [
  //         {
  //           name: "User App Auth",
  //           description: "Authentication endpoints for User App",
  //         },
  //       ],
  //     },
  //   })
  // )
  .use(cors())
  .use(ip())
  .use(
    jwt({
      name: "jwt",
      secret: `${process.env.JWT_SECRET}`,
      exp: "30d",
    })
  )
  .use(
    logger({
      mode: "combined",
      enabled: true,
      withTimestamp: true,
    })
  )
  .onRequest((ctx) => {
    setHeaders(ctx);
  })
  .onError(({ set, code, error }: any) => {
    set.status = 400;

    if (code === "VALIDATION") {
      if (typeof error.message != "string") {
        let { errors }: any = error.message;

        const messages = errors?.flatMap((e: any) =>
          Object.values(e.schema?.properties || {}).map((p: any) => p.error)
        );
        return {
          success: false,
          message: messages.join(", "),
        };
      }
      try {
        let parsedError = JSON.parse(error.message);
        return {
          success: false,
          message: `${parsedError?.message}. ${parsedError?.summary}`,
        };
      } catch (error) { }
      return {
        success: false,
        message: error.message,
      };
    }
    return {
      success: false,
      message: error?.message || "Internal Server Error",
    };
  });

async function startServer() {
  try {
    // Ensure database connection is established first
    console.log("🔗 Connecting to database...");
    await connectToDb();
    logMemoryUsage("After DB Connection");

    // Double-check connection is ready before proceeding
    const { isDbConnected, waitForConnection } = await import(
      "./utils/db.config"
    );
    if (!isDbConnected()) {
      console.log("⏳ Waiting for database connection to be ready...");
      const connectionReady = await waitForConnection(15000);
      if (!connectionReady) {
        throw new Error("Database connection failed - unable to proceed");
      }
    }

    console.log("✅ Database connection established, loading modules...");

    var files = await readdir("./src/modules");
    for (var i in files) {
      const file = Bun.file(`src/modules/${files[i]}/route.ts`);
      if (await file.exists()) {
        try {
          const moduleRoute = await import(`./modules/${files[i]}/route`);
          app.group("/api/v1", (admin) => moduleRoute.default(admin));
          console.log(`📦 Loaded module: ${files[i]}`);
        } catch (moduleError: any) {
          console.log(
            `❌ Failed to load module ${files[i]}:`,
            moduleError.message
          );
          // Continue loading other modules instead of crashing
        }
      }
    }

    logMemoryUsage("After Module Loading");

    app.use(sentry()).listen(process.env.PORT || 3000, async () => {
      // dataMigrate()
      // paymentWalletMigrate()
      // walletMigrate()
      // cancellationMigartion()
      // payoutMigartion()
      // customePayoutByRBC()
      // migrateWalletOfDriver()
      // customPayoutEntry()
      // doublePaySameJob()
      // rideCountAggregation()
      // payoutAllPendingDrivers()
      // createPendingPayout();
      // stripAccountDelete()
      console.log(`Elysia is running at ${process.env.PORT}`);
      logMemoryUsage("Server Started");
    });

    // Register cleanup for server
    globalResourceManager.register(async () => {
      console.log("Cleaning up server resources...");
      // Add any server-specific cleanup here
    });
  } catch (error: any) {
    console.log(error, "❌ Failed to start server:", error.message);
    process.exit(1); // Exit with error code
  }
}
startServer();
