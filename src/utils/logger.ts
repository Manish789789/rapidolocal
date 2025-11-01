// import { createLogger, transports, format } from "winston";
// const ENVIRONMENT = process.env.NODE_ENV;

// let logConfiguration;
// if (ENVIRONMENT !== 'development') {
//     logConfiguration = {
//         transports: [
//             new transports.File({ filename: `${__dirname}/../logs/error.log` }),
//         ],
//         format: format.combine(
//             format.timestamp({ format: 'MMM-DD-YYYY hh:mm:ss.SSS A' }),
//             format.json(),
//             format.prettyPrint()
//         ),
//     }
// } else {
//     logConfiguration = {
//         transports: [
//             new transports.Console(),
//             new transports.File({ filename: `${__dirname}/../logs/error.log` }),
//         ],
//         format: format.combine(
//             format.timestamp({ format: 'MMM-DD-YYYY hh:mm:ss.SSS A' }),
//             format.json(),
//             format.prettyPrint()
//         ),
//     };
// }
// export const logger = createLogger(logConfiguration);



import { createLogger, transports, format } from "winston";
import path from "path";

const addCallerInfo = format((info) => {
    const obj = {} as any;
    Error.captureStackTrace(obj); // capture stack here

    const stackLines = obj.stack?.split("\n");
    if (stackLines && stackLines.length > 3) {
        // skip first 3 (Error, winston internals)
        const callerLine = stackLines[3].trim();
        const match = callerLine.match(/\((.*):(\d+):(\d+)\)/);

        if (match) {
            info.file = path.relative(process.cwd(), match[1]);
            info.line = match[2];
            info.column = match[3];
        } else {
            info.caller = callerLine; // fallback
        }
    }

    return info;
});

export const logger = createLogger({
    transports: [
        new transports.Console(),
        new transports.File({ filename: `${__dirname}/../logs/error.log` }),
    ],
    format: format.combine(
        format.timestamp({ format: "MMM-DD-YYYY hh:mm:ss.SSS A" }),
        addCallerInfo(), // 👈 adds file/line to logs
        format.json(),
        format.prettyPrint()
    ),
});
