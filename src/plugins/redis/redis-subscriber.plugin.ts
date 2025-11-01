import { createClient } from "redis";
import { Elysia } from "elysia";
import { wsInstance } from "../websocket/websocket.plugin";
import { logger } from "@/utils/logger";
import { globalResourceManager, CircuitBreaker } from "@/utils/memoryOptimizer";
import { getDriversFromRedis, getRidesFromRedis } from "@/utils/redisHelper";
import { bookingStatus } from "@/modules/ride-bookings/models/rideBookings.model";

// Import WebSocket functions for sending events
let sendSocket: any = null;
let sendToAll: any = null;

// Import the main Redis client for get operations
let getMainRedis: any = null;

// Circuit breaker for Redis operations
const redisCircuitBreaker = new CircuitBreaker(3, 30000); // 3 failures, 30s timeout

// Lazy load required functions to avoid circular dependency
function loadRequiredFunctions() {
  if (!sendSocket || !sendToAll) {
    try {
      const websocketModule = require("../../utils/websocket");
      sendSocket = websocketModule.sendSocket;
      sendToAll = websocketModule.sendToAll;
    } catch (error) {
      logger.error({ error, msg: "Failed to load websocket functions" });
    }
  }

  if (!getMainRedis) {
    try {
      const redisModule = require("./redis.plugin");
      getMainRedis = redisModule.redis;
    } catch (error) {
      logger.error({ error, msg: "Failed to load Redis module" });
    }
  }
}

let redisSubscriber: ReturnType<typeof createClient> | null = null;
let isSubscriberConnected = false;

// Initialize Redis subscriber connection
async function initRedisSubscriber() {
  try {
    if (isSubscriberConnected && redisSubscriber) return redisSubscriber;

    redisSubscriber = createClient({
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      socket: {
        host: process.env.REDIS_SOCKET_HOST || "",
        port: Number(process.env.REDIS_SOCKET_PORT) || 16648,
        connectTimeout: 60000,
        keepAlive: true,
        family: 4, // Force IPv4
      },
    });

    redisSubscriber.on("error", (err) => {
      logger.error({ error: err, msg: "Redis Subscriber Error" });
      isSubscriberConnected = false;
    });

    redisSubscriber.on("connect", () => {
      logger.info({ msg: "Redis Subscriber connected successfully" });
    });

    redisSubscriber.on("disconnect", () => {
      logger.warn({ msg: "Redis Subscriber disconnected" });
      isSubscriberConnected = false;
    });

    await redisSubscriber.connect();
    isSubscriberConnected = true;

    await redisSubscriber.pSubscribe(
      "__keyspace@0__:driver:*",
      (message, channel) => {
        redisCircuitBreaker.execute(() =>
          handleDriverKeyspaceEvent(message, channel)
        );
      }
    );
    await redisSubscriber.pSubscribe(
      "__keyspace@0__:booking:*",
      (message, channel) => {
        redisCircuitBreaker.execute(() =>
          handleRidesKeyspaceEvent(message, channel)
        );
      }
    );

    globalResourceManager.register(async () => {
      logger.info({ msg: "Cleaning up Redis subscriber..." });
      if (redisSubscriber && isSubscriberConnected) {
        try {
          await redisSubscriber.disconnect();
        } catch (error) {
          logger.error({ error, msg: "Error disconnecting Redis subscriber" });
        }
      }
    });

    return redisSubscriber;
  } catch (error) {
    logger.error({ error, msg: "Failed to initialize Redis subscriber" });
    return null;
  }
}

// Handler for driver keyspace events with better error handling
async function handleDriverKeyspaceEvent(operation: string, keyspace: string) {
  try {
    // Load required functions if not already loaded
    loadRequiredFunctions();

    // Extract the actual key name from keyspace notification
    const key = keyspace.replace("__keyspace@0__:", "");
    // Extract driver ID from key (assuming pattern like "driver-123-location")
    const keyParts = key.split("-");
    const driverId = keyParts[1]; // driver-123-location -> 123
    // if (operation === "json.set" && getMainRedis) {
    //   try {
    //     const mainRedisClient = getMainRedis();
    //     if (mainRedisClient) {
    //       const drivers: any[] = await getDriversFromRedis();
    //       const ws = wsInstance.get("global");
    //       if (ws) {
    //         ws.publish(
    //           `admin-group`,
    //           JSON.stringify({
    //             event: "ADMIN_DRIVERS_LIST",
    //             data: drivers,
    //           })
    //         );
    //       }
    //     }
    //   } catch (e) {
    //     logger.error({
    //       error: e,
    //       msg: "Error processing driver keyspace event",
    //     });
    //   }
    // }
  } catch (error) {
    logger.error({ error, msg: "Error in handleDriverKeyspaceEvent" });
  }
}
async function handleRidesKeyspaceEvent(operation: string, keyspace: string) {
  try {
    loadRequiredFunctions();
    const key = keyspace.replace("__keyspace@0__:", "");
    const keyParts = key.split("-");
    if (operation === "json.set" && getMainRedis) {
      try {
        const mainRedisClient = getMainRedis();
        if (mainRedisClient) {
          const rides = await getRidesFromRedis({
            tripStatus: [
              bookingStatus.finding_driver,
              bookingStatus.ontheway,
              bookingStatus.arrived,
              bookingStatus.picked,
            ],
          });
          const ws = wsInstance.get("global");
          if (ws) {
            ws.publish(
              `admin-group`,
              JSON.stringify({
                event: "ADMIN_RIDES_LIST",
                data: rides,
              })
            );
          }
        }
      } catch (e) {
        logger.error({
          error: e,
          msg: "Error processing driver keyspace event",
        });
      }
    }
  } catch (error) {
    logger.error({ error, msg: "Error in handleDriverKeyspaceEvent" });
  }
}

// Simple helper to get Redis subscriber client
export function getRedisSubscriber() {
  if (!redisSubscriber || !isSubscriberConnected) {
    return null;
  }
  return redisSubscriber;
}

// Elysia plugin for Redis subscriber
export const redisSubscriberPlugin = new Elysia({ name: "redis-subscriber" })
  .derive({ as: "scoped" }, () => ({
    redisSubscriber: getRedisSubscriber(),
  }))
  .onStart(async () => {
    await initRedisSubscriber();
  });
