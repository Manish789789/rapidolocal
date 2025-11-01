// export const getDirections = async (address: any = []) => {
//     try {
//         if (!address || !address?.length || address.length < 2) {
//             return false
//         }
//         let origin = address.shift();
//         let destination = address.pop();
//         if (!origin?.location?.latitude || !origin?.location?.longitude || !destination?.location?.latitude || !destination?.location?.longitude) {
//             return false
//         }

//         const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
//         let params: any = {
//             // origin: `${origin.location.latitude},${origin.location.longitude}`,
//             // destination: `${destination.location.latitude},${destination.location.longitude}`,
//             destination: `${origin.location.latitude},${origin.location.longitude}`,
//             origin: `${destination.location.latitude},${destination.location.longitude}`,
//             avoid: "ferries",
//             key: GOOGLE_API_KEY
//         };

//         if (address.length != 0) {
//             params.waypoints = address.map(point => `${point.location.latitude},${point.location.longitude}`).join('|')
//         }

//         Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
//         try {
//             const response = await fetch(url);
//             const data = await response.json();

//             if (data.status === 'OK') {

//                 for (let legs of data.routes[0].legs) {
//                     for (let step of legs.steps) {
//                         if (typeof step.maneuver != 'undefined' && step.maneuver == 'ferry') {
//                             return false;
//                         }
//                     }
//                 }
//                 return data.routes
//             } else {
//                 return false
//             }
//         } catch (e) {
//             logger.error({ error: e, msg: e.message });
//             return false
//         }
//     } catch (e) {
//         logger.error({ error: e, msg: e.message });
//         return false
//     }
// }



// export const getDirectionsDistanceTime = async (driverId: any, address: any = [], isDestination: Boolean = false) => {
//     let Distancekm = 0;
//     let DurationMin = `0 mins`;
//     try {
//         if (!address || !address?.length || address?.length < 2) {
//             return { Distancekm, DurationMin }
//         }
//         let DriversModel = await tenantModal(Drivers);
//         let driverInfo = await DriversModel.findOne({ _id: driverId });

//         let destination;
//         if (!isDestination) {
//             destination = address[0];
//         } else {
//             destination = address[address.length - 1]
//         }

//         const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
//         let params: any = {
//             origin: `${driverInfo.location.coordinates[1]},${driverInfo.location.coordinates[0]}`,
//             destination: `${destination.location.latitude},${destination.location.longitude}`,
//             avoid: "ferries",
//             key: GOOGLE_API_KEY
//         };

//         if (isDestination) {
//             if (address.length != 0) {
//                 params.waypoints = address.map((point, index) => {
//                     if (index > 0) {
//                         return `${point.location.latitude},${point.location.longitude}`
//                     }
//                 }).join('|')
//             }
//         }

//         Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
//         try {
//             const response = await fetch(url);
//             const data = await response.json();
//             if (data.status === 'OK') {
//                 for (let legs of data.routes[0].legs) {
//                     for (let step of legs.steps) {
//                         if (typeof step.maneuver != 'undefined' && step.maneuver == 'ferry') {
//                             return { Distancekm, DurationMin };
//                         }
//                     }
//                 }

//                 let distance: any = data.routes[0]?.legs?.reduce((prev, curr) => prev + curr.distance.value, 0)
//                 let duration: any = data.routes[0]?.legs?.reduce((prev, curr) => prev + curr.duration.value, 0)

//                 Distancekm = (distance / 1000);
//                 DurationMin = `${Math.round(duration / 60)} mins`;
//                 return { Distancekm, DurationMin }
//             } else {
//                 return { Distancekm, DurationMin }
//             }
//         } catch (e) {
//             logger.error({ error: e, msg: e.message });
//             return { Distancekm, DurationMin }
//         }
//     } catch (e) {
//         logger.error({ error: e, msg: e.message });
//         return { Distancekm, DurationMin }
//     }
// }



// export const getDistanceTime = async (dropLoc: any = [], address: any = []) => {
//     let DistancekmCheck = 5;
//     let DurationMinCheck = `0 mins`;
//     try {
//         if (!dropLoc || !dropLoc?.length) {
//             return { DistancekmCheck, DurationMinCheck }
//         }
//         if (!address || !address?.length || address?.length < 2) {
//             return { DistancekmCheck, DurationMinCheck }
//         }

//         let origin = dropLoc[dropLoc.length - 1]
//         let destination = address[0]

//         const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
//         let params: any = {
//             origin: `${origin.location.latitude},${origin.location.longitude}`,
//             destination: `${destination.location.latitude},${destination.location.longitude}`,
//             avoid: "ferries",
//             key: GOOGLE_API_KEY
//         };

//         // if (address.length != 0) {
//         //     params.waypoints = address.map(point => `${point.location.latitude},${point.location.longitude}`).join('|')
//         // }

//         Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
//         try {
//             const response = await fetch(url);
//             const data = await response.json();
//             if (data.status === 'OK') {
//                 for (let legs of data.routes[0].legs) {
//                     for (let step of legs.steps) {
//                         if (typeof step.maneuver != 'undefined' && step.maneuver == 'ferry') {
//                             return { DistancekmCheck, DurationMinCheck };
//                         }
//                     }
//                 }

//                 let distance: any = data.routes[0]?.legs?.reduce((prev, curr) => prev + curr.distance.value, 0)
//                 let duration: any = data.routes[0]?.legs?.reduce((prev, curr) => prev + curr.duration.value, 0)

//                 DistancekmCheck = (distance / 1000);
//                 DurationMinCheck = `${Math.round(duration / 60)} mins`;
//                 return { DistancekmCheck, DurationMinCheck }
//             } else {
//                 return { DistancekmCheck, DurationMinCheck }
//             }
//         } catch (e) {
//             logger.error({ error: e, msg: e.message });
//             return { DistancekmCheck, DurationMinCheck }
//         }
//     } catch (e) {
//         logger.error({ error: e, msg: e.message });
//         return { DistancekmCheck, DurationMinCheck }
//     }
// }