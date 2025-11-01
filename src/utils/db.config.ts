import mongoose from "mongoose";
import { logger } from "./logger";

let retryCount = 0;
const MAX_RETRIES = 5;
let isConnected = false;

// Connection state tracking
export function isDbConnected(): boolean {
    return isConnected && mongoose.connection.readyState === 1;
}

// Wait for connection to be ready
export async function waitForConnection(timeoutMs = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (!isDbConnected() && (Date.now() - startTime) < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return isDbConnected();
}

export async function connectToDb(): Promise<void> {
    const mongoDBURI = process.env.MONGOURI ?? 'mongodb://localhost:27017';
    
    // Configure connection options for better memory management
    const options = {
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 10000, // Increased timeout
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        bufferCommands: false, // Disable mongoose buffering - handle readiness manually
        autoIndex: false, // Don't build indexes automatically
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        family: 4, // Use IPv4, skip trying IPv6
    } as mongoose.ConnectOptions;
    
    const connection = mongoose.connection;
    
    // Set up connection event handlers
    connection.on('connected', () => {
        console.log("MongoDB connected successfully");
        isConnected = true;
        retryCount = 0; // Reset retry count on successful connection
    });
    
    connection.on('error', (err) => {
        logger.error({ error: err, msg: "MongoDB connection error" });
        isConnected = false;
    });
    
    connection.on('disconnected', () => {
        console.log("MongoDB disconnected");
        isConnected = false;
    });
    
    try {
        await mongoose.connect(mongoDBURI, options);
        
        // Wait for connection to be fully ready
        const connectionReady = await waitForConnection(15000);
        if (!connectionReady) {
            throw new Error("Database connection timeout");
        }
        
        console.log("MongoDB connected to:", connection.db?.databaseName);
        
    } catch (err) {
        logger.error({ error: err, msg: "MongoDB connection failed" });
        isConnected = false;
        throw err; // Re-throw to handle in calling code
    }
}

function retryConnection() {
    if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
        
        console.log(`Retrying MongoDB connection (${retryCount}/${MAX_RETRIES}) in ${delay}ms...`);
        
        setTimeout(async () => {
            try {
                await connectToDb();
            } catch (e: any) {
                logger.error({ error: e, msg: e.message });
                retryConnection(); // Try again on failure
            }
        }, delay);
    } else {
        logger.error({ msg: "Max MongoDB connection retries reached. Exiting..." });
        process.exit(1);
    }
}