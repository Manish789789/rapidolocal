import Drivers from "@/modules/drivers/models/drivers.model";
import { logger } from "../logger";
import polyline from "@mapbox/polyline";
import rideBookingsModel from "@/modules/ride-bookings/models/rideBookings.model";
import driversModel from "@/modules/drivers/models/drivers.model";
import mongoose from "mongoose";
import { getDriverFromRedis } from "../redisHelper";

export const getDirections = async (address: any = [], isOrigin = false) => {
  try {
    if (!address || !address?.length || address.length < 2) {
      return false;
    }
    let origin: any;
    let destination: any;
    if (isOrigin) {
      destination = address.shift();
      origin = address.pop();
    } else {
      origin = address.shift();
      destination = address.pop();
    }

    if (
      !origin?.location?.latitude ||
      !origin?.location?.longitude ||
      !destination?.location?.latitude ||
      !destination?.location?.longitude
    ) {
      return false;
    }

    const baseUrl =
      "https://api.mapbox.com/directions/v5/mapbox/driving-traffic";
    const waypoints = address.map(
      (point: any) => `${point.location.longitude},${point.location.latitude}`
    );

    const coordinates = [
      `${origin.location.longitude},${origin.location.latitude}`,
      ...waypoints,
      `${destination.location.longitude},${destination.location.latitude}`,
    ].join(";");

    const url = new URL(`${baseUrl}/${coordinates}`);
    url.searchParams.append("geometries", "polyline");
    url.searchParams.append("steps", "true");
    url.searchParams.append("language", "en");
    url.searchParams.append("overview", "full");
    url.searchParams.append("alternatives", "false");
    url.searchParams.append("exclude", "ferry");
    url.searchParams.append("access_token", process.env.MAP_BOX_TOKEN || "");

    try {
      const response = await fetch(url?.toString());
      const data = await response.json();

      if (data.code === "Ok") {
        // Transform the Mapbox response to match Google API's format
        const routes = data.routes.map((route: any) => ({
          legs: route.legs.map((leg: any) => ({
            steps: leg.steps.map((step: any) => ({
              ...step,
              maneuver: step.maneuver?.modifier || step.maneuver?.type,
              distance: {
                value: step.distance,
              },
              duration: {
                value: step.duration,
              },
            })),
            distance: {
              value: leg.distance,
            },
            duration: {
              value: leg.duration,
            },
          })),
          overview_polyline: {
            points: route.geometry,
          },
        }));

        // Check for ferry routes in steps
        for (let legs of routes[0].legs) {
          for (let step of legs.steps) {
            if (step.maneuver === "ferry") {
              return false;
            }
          }
        }
        return routes;
      } else {
        return false;
      }
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return false;
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const getDirectionsWithoutMapbox = async (address: any = [], isOrigin = false) => {
  try {
    let origin: any;
    let destination: any;
    if (isOrigin) {
      destination = address.shift();
      origin = address.pop();
    } else {
      origin = address.shift();
      destination = address.pop();
    }

    if (
      !origin?.location?.latitude ||
      !origin?.location?.longitude ||
      !destination?.location?.latitude ||
      !destination?.location?.longitude
    ) {
      return false;
    }

    const baseUrl =
      "http://172.105.98.102:5000/route/v1/driving";
    const waypoints = address.map(
      (point: any) => `${point.location.longitude},${point.location.latitude}`
    );

    const coordinates = [
      `${origin.location.longitude},${origin.location.latitude}`,
      ...waypoints,
      `${destination.location.longitude},${destination.location.latitude}`,
    ].join(";");

    const url = new URL(`${baseUrl}/${coordinates}`);
    // console.log(url?.toString(), 'osrmUrl**')
    url.searchParams.append("geometries", "polyline");
    url.searchParams.append("steps", "true");
    url.searchParams.append("overview", "full");
    try {
      const response = await fetch(url?.toString());
      const data = await response.json();

      if (data.code === "Ok") {
        // Transform local OSRM response to match Mapbox-transformed format
        const routes = data.routes.map((route: any) => ({
          legs: route.legs.map((leg: any) => ({
            steps: leg.steps
              ? leg.steps.map((step: any) => ({
                ...step,
                maneuver: step.maneuver?.modifier || step.maneuver?.type || "",
                distance: { value: step.distance },
                duration: { value: step.duration },
              }))
              : [],
            distance: { value: leg.distance },
            duration: { value: leg.duration },
          })),
          overview_polyline: {
            points: route.geometry,
          },
        }));

        // Check for ferry routes
        for (let legs of routes[0].legs) {
          for (let step of legs.steps) {
            if (step.maneuver === "ferry") {
              return false;
            }
          }
        }
        return routes;
      } else {
        return false;
      }
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return false;
    }

  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};

export const getPriorityDrivers = async () => {
  try {
    let priorityDriverIds = await driversModel
      .find(
        {
          "vehicleInfo.isApproved": true,
          iAmOnline: true,
          iAmBusy: false,
          isDriverUnderPool: false,
          $or: [
            {
              _id: {
                $in: [
                  "67feb47d887d1e930fd129f0",
                  "67eebf0ccdb1453ecc747fb7",
                  "67e9542514af96c1a2c0bf28",
                  "67907125ff6beeb1b7411822",
                  "6796f5787707eadcd9d33ab4",
                  "67786ec1b210323dd56025cd",
                  "67b5ec72af86f5eb2c245152",
                  "67c56d9c548ae865dab57f21",
                  "67e303627548686afc1e1fb2",
                  "67ec90dccdb1453ecc3402c4",
                  "66c7c646cd6f872c5800026f",
                  "67db0731e31a994b4c6c7fe9",
                  "67f1321b8e80cca532d26068",
                  "67ec90dccdb1453ecc3402c4",
                  "67f26b7961cab88a95d976ea",
                  "679fbc87d04f752b04683443",
                  "672b6c80eacc9460569a3b85",
                  "66c72ff9cd6f872c58ff0e7f",
                  "67cf5d3cf2e58ee70cf7ad9c",
                  "66d62df99c968069a3f31324",
                  "67d898427468d374174d9c2e",
                  "67c22c792184b113ed17c04c",
                  "67d05b93f2e58ee70c086a6a",
                  "67ecb45ccdb1453ecc388756",
                  "66e8c57e5c0cee0ca5559105",
                  "67660f25b210323dd5c0f58d",
                  "67a49751aff9da5b9b4c159e",
                  "67d2e4377468d37417bbb31d",
                  "66f77ebaf985f880b2b8166c",
                  "681162c7a5a61e0dce998ba9",
                  "665a325056eea0d61aeb8f51",
                  "664b7fa257c2aecb993f059f",
                  "66a594545e88ea83c7371708",
                  "67b382f3b499328bd128139d",
                  "66f2fff05c0cee0ca541b88c",
                  "66a2c3ec248e9496083681b7",
                  "66f31ede5c0cee0ca5469575",
                  "665a30cf56eea0d61aeb8ee1",
                  "67f3c5c52b03c9a89b2e2997",
                  "67b10b95b499328bd1fac96d",
                  "681539da880c0a2ce87f2176",
                  "670d2bbf87647606e9d7c209",
                  "66525e4498501b12df74d3f9",
                  "67ad3c75f357a35e0dc7ae33",
                  "66aaa88aeb7bfda741dcd932",
                  "67f462b36e3db98a8399156c",
                  "669d78ec780c2f28f61251f5",
                  "67a456d473c84c4e209cd52f", //testing
                ],
              },
            },
            {
              createdAt: {
                $gte: new Date("2025-03-01T00:00:00Z"),
              },
            },
          ],
        },
        { _id: 1 }
      )
      .lean();
    const result = priorityDriverIds?.map((driver) => driver?._id?.toString());
    return result;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
  }
};

export const getNearByDriverDetails = async (tripAddress: any) => {
  let returnObj = { Distancekm: 10, DurationMin: `10 mins` };
  let driverList = await driversModel.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [
            tripAddress[0].location.longitude,
            tripAddress[0].location.latitude,
          ],
        },
        distanceField: "distance",
        maxDistance: 10000,
        spherical: true,
      },
    },
    {
      $match: {
        iAmOnline: true,
        isDriverUnderPool: false,
        stopFutureRide: false,
        "vehicleInfo.isApproved": true,
      },
    },
    {
      $sort: {
        distance: 1,
      },
    },
    {
      $limit: 1,
    },
  ]);

  if (driverList.length === 1) {
    let { Distancekm, DurationMin } = await getDirectionsDistanceTime(
      driverList[0]._id,
      tripAddress
    );
    returnObj = { Distancekm, DurationMin };
  }
  return returnObj;
};

export const getNearByDrivers = async (
  address: any,
  maxDistance = 50000,
  iAmBusy = [false],
  minDistance = 0,
  rejectedDriver = [],
  isDriverUnderPool = false,
  priorityDrivers = [],
  filterPriorityDrivers = false
) => {
  const adminPriorityDriverListIndex: any = filterPriorityDrivers
    ? await getPriorityDrivers()
    : [];
  const adminPriorityDriverList = adminPriorityDriverListIndex.map(
    (id: any) => new mongoose.Types.ObjectId(id)
  );

  const excludedDriverIds = [...rejectedDriver, ...priorityDrivers]?.map(
    (id: any) => new mongoose.Types.ObjectId(id)
  );

  let origin = address.shift();
  // console.log(origin, 'origin**')

  const pipeline: any[] = [
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [origin.location.longitude, origin.location.latitude],
        },
        distanceField: "distance",
        maxDistance,
        minDistance,
        spherical: true,
      },
    },
    {
      $match: {
        iAmOnline: true,
        isDriverUnderPool: isDriverUnderPool,
        iAmBusy: { $in: iAmBusy },
        "vehicleInfo.isApproved": true,
      },
    },
  ];
  // console.log(pipeline, 'pipeline**')

  if (filterPriorityDrivers) {
    pipeline?.push({
      $match: {
        _id: {
          $in: adminPriorityDriverList,
          $nin: excludedDriverIds,
        },
      },
    });
  } else {
    pipeline?.push({
      $match: {
        _id: { $nin: excludedDriverIds },
      },
    });
  }

  return await driversModel
    .aggregate([
      ...pipeline,
      {
        $sort: {
          distance: 1,
        },
      },
    ])
    .catch((err) => {
      return [];
    });
};

export const getWeatherDetails = async (lat: any, long: any) => {
  const url = `https://api.weatherstack.com/current?access_key=${process.env.WEATHER_API_KEY}&query=${lat},${long}`;
  const options = {
    method: "GET",
  };

  let underSurge = 0;
  let weather_code = "";
  return { underSurge, weather_code };
  try {
    const response = await fetch(url, options);
    let result = await response.json();
    weather_code = result.current.weather_code;
    switch (result.current.weather_code) {
      case 395:
        underSurge = 0.3;
        break;
      case 392:
        underSurge = 0.3;
        break;
      case 389:
        underSurge = 0.3;
        break;
      case 386:
        underSurge = 0.3;
        break;
      case 377:
        underSurge = 0.3;
        break;
      case 374:
        underSurge = 0;
        break;
      case 371:
        underSurge = 0.3;
        break;
      case 368:
        underSurge = 0;
        break;
      case 365:
        underSurge = 0;
        break;
      case 362:
        underSurge = 0;
        break;
      case 359:
        underSurge = 0;
        break;
      case 356:
        underSurge = 0.3;
        break;
      case 353:
        underSurge = 0;
        break;
      case 338:
        underSurge = 0.3;
        break;
      case 335:
        underSurge = 0;
        break;
      case 332:
        underSurge = 0;
        break;
      case 329:
        underSurge = 0;
        break;
      case 326:
        underSurge = 0;
        break;
      case 323:
        underSurge = 0;
        break;
      case 320:
        underSurge = 0;
        break;
      case 317:
        underSurge = 0;
        break;
      case 314:
        underSurge = 0.3;
        break;
      case 311:
        underSurge = 0;
        break;
      case 308:
        underSurge = 0.3;
        break;
      case 305:
        underSurge = 0.3;
        break;
      case 302:
        underSurge = 0;
        break;
      case 299:
        underSurge = 0;
        break;
      case 296:
        underSurge = 0;
        break;
      case 293:
        underSurge = 0;
        break;
      case 284:
        underSurge = 0.3;
        break;
      case 281:
        underSurge = 0;
        break;
      case 266:
        underSurge = 0;
        break;
      case 263:
        underSurge = 0;
        break;
      case 260:
        underSurge = 0;
        break;
      case 248:
        underSurge = 0;
        break;
      case 230:
        underSurge = 0;
        break;
      case 227:
        underSurge = 0;
        break;
      case 200:
        underSurge = 0;
        break;
      case 185:
        underSurge = 0;
        break;
      case 182:
        underSurge = 0;
        break;
      case 179:
        underSurge = 0;
        break;
      case 176:
        underSurge = 0;
        break;
      case 143:
        underSurge = 0;
        break;
      case 122:
        underSurge = 0;
        break;
      case 119:
        underSurge = 0;
        break;
      case 116:
        underSurge = 0;
        break;
      case 113:
        underSurge = 0;
        break;
      default:
        underSurge = 0;
        break;
    }
    return { underSurge, weather_code };
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return { underSurge, weather_code };
  }
};

export const getDistanceTime = async (dropLoc: any = [], address: any = []) => {
  let DistancekmCheck = 5;
  let DurationMinCheck = `0 mins`;
  try {
    if (!dropLoc || !dropLoc?.length) {
      return { DistancekmCheck, DurationMinCheck };
    }
    if (!address || !address?.length || address?.length < 2) {
      return { DistancekmCheck, DurationMinCheck };
    }

    let origin = dropLoc[dropLoc.length - 1];
    let destination = address[0];

    const baseUrl =
      "https://api.mapbox.com/directions/v5/mapbox/driving-traffic";

    const coordinates = [
      `${origin.location.longitude},${origin.location.latitude}`,
      `${destination.location.longitude},${destination.location.latitude}`,
    ].join(";");

    const url = new URL(`${baseUrl}/${coordinates}`);
    url.searchParams.append("geometries", "polyline");
    url.searchParams.append("steps", "true");
    url.searchParams.append("language", "en");
    url.searchParams.append("overview", "full");
    url.searchParams.append("alternatives", "false");
    url.searchParams.append("exclude", "ferry");
    url.searchParams.append("access_token", process.env.MAP_BOX_TOKEN || "");

    try {
      const response = await fetch(url?.toString());
      const data = await response.json();

      if (data.code === "Ok") {
        // Transform the Mapbox response to match Google API's format
        const routes = data.routes.map((route: any) => ({
          legs: route.legs.map((leg: any) => ({
            steps: leg.steps.map((step: any) => ({
              ...step,
              maneuver: step.maneuver?.modifier || step.maneuver?.type,
              distance: {
                value: step.distance,
              },
              duration: {
                value: step.duration,
              },
            })),
            distance: {
              value: leg.distance,
            },
            duration: {
              value: leg.duration,
            },
          })),
          overview_polyline: {
            points: route.geometry,
          },
        }));

        // Check for ferry routes in steps
        for (let legs of routes[0].legs) {
          for (let step of legs.steps) {
            if (step.maneuver === "ferry") {
              return { DistancekmCheck, DurationMinCheck };
            }
          }
        }

        DistancekmCheck = routes[0].legs[0].distance.value / 1000;
        DurationMinCheck = `${Math.round(
          routes[0].legs[0].duration.value / 60
        )} mins`;

        return { DistancekmCheck, DurationMinCheck };
      } else {
        return { DistancekmCheck, DurationMinCheck };
      }
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return { DistancekmCheck, DurationMinCheck };
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return { DistancekmCheck, DurationMinCheck };
  }
};

export const getDirectionsDistanceTime = async (
  driverId: any,
  address: any = [],
  isDestination: Boolean = false
) => {
  let Distancekm = 0;
  let DurationMin = `0 mins`;
  try {
    if (!address || !address?.length || address?.length < 2) {
      return { Distancekm, DurationMin };
    }
    // let driverInfo: any = await driversModel.findOne({ _id: driverId });
    let driverInfos: any = await getDriverFromRedis(String(driverId));
    let driverInfo = driverInfos[0]

    let destination;
    if (!isDestination) {
      destination = address[0];
    } else {
      destination = address[address.length - 1];
    }

    const baseUrl =
      "https://api.mapbox.com/directions/v5/mapbox/driving-traffic";
    let waypoints = [];
    if (isDestination) {
      if (address.length != 0) {
        waypoints = address.map(
          (point: any) =>
            `${point.location.longitude},${point.location.latitude}`
        );
      }
    }

    const coordinates: any = [
      `${driverInfo?.location?.coordinates[0]},${driverInfo?.location?.coordinates[1]}`,
      ...waypoints,
      `${destination.location.longitude},${destination.location.latitude}`,
    ].join(";");

    const url = new URL(`${baseUrl}/${coordinates}`);
    url.searchParams.append("geometries", "polyline");
    url.searchParams.append("steps", "true");
    url.searchParams.append("language", "en");
    url.searchParams.append("overview", "full");
    url.searchParams.append("alternatives", "false");
    url.searchParams.append("exclude", "ferry");
    url.searchParams.append("access_token", process.env.MAP_BOX_TOKEN || "");

    try {
      const response = await fetch(url?.toString());
      const data = await response.json();

      if (data.code === "Ok") {
        // Transform the Mapbox response to match Google API's format
        const routes = data.routes.map((route: any) => ({
          legs: route.legs.map((leg: any) => ({
            steps: leg.steps.map((step: any) => ({
              ...step,
              maneuver: step.maneuver?.modifier || step.maneuver?.type,
              distance: {
                value: step.distance,
              },
              duration: {
                value: step.duration,
              },
            })),
            distance: {
              value: leg.distance,
            },
            duration: {
              value: leg.duration,
            },
          })),
          overview_polyline: {
            points: route.geometry,
          },
        }));

        // Check for ferry routes in steps
        for (let legs of routes[0].legs) {
          for (let step of legs.steps) {
            if (step.maneuver === "ferry") {
              return { Distancekm, DurationMin };
            }
          }
        }

        Distancekm = routes[0].legs[0].distance.value / 1000;
        DurationMin = `${Math.round(
          routes[0].legs[0].duration.value / 60
        )} mins`;

        return { Distancekm, DurationMin };
      } else {
        return { Distancekm, DurationMin };
      }
    } catch (e: any) {
      logger.error({ error: e, msg: e.message });
      return { Distancekm, DurationMin };
    }
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return { Distancekm, DurationMin };
  }
};

export const getPlacesFromMapBox = async (
  queryText: any,
  accessToken: any,
  countryCode = "ca",
  sessionToken = ""
) => {
  try {
    // let places = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?q=${queryText}&language=en&limit=5&session_token=${sessionToken}&country=${countryCode}&access_token=${accessToken}`);
    // let results = await places.json();
    // let formattedResults = results.suggestions.map((singleSuggestion) => {
    //     let { name, mapbox_id, full_address } = singleSuggestion;
    //     return {
    //         address: full_address || "",
    //         place_id: mapbox_id,
    //         title: name || '',
    //         country: countryCode
    //     };
    // })
    // return formattedResults;
    return [];
  } catch (e) {
    throw new Error("Failed to fetch");
  }
};

export const getDetailsOfPlacesFromMapBox = async (
  placeId: any,
  accessToken: any,
  sessionToken = ""
) => {
  try {
    // let placeDetail = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${placeId}?session_token=${sessionToken}&access_token=${accessToken}`);
    // let results = await placeDetail.json();
    // results = {
    //     ...results.features[0],
    //     geometry: {
    //         location: { lat: results.features[0].geometry.coordinates[1], lng: results.features[0].geometry.coordinates[0] },
    //     },
    // }
    // return results;
    return null;
  } catch (e) {
    throw new Error("Failed to fetch");
  }
};

export const getPlacesFromMapBoxByLatLong = async (
  queryText: any,
  accessToken: any,
  latitude: any,
  longitude: any,
  sessionToken = ""
) => {
  try {
    let places = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/suggest?q=${queryText}&language=en&limit=5&session_token=${sessionToken}&access_token=${accessToken}&proximity=${longitude},${latitude}`
    );
    let results = await places.json();
    let formattedResults = results?.suggestions?.map(
      (singleSuggestion: any) => {
        let { name, mapbox_id, full_address } = singleSuggestion;
        return {
          formatted_address: full_address || "",
          place_id: mapbox_id,
          title: name || "",
        };
      }
    );
    return formattedResults;
  } catch (e) {
    throw new Error("Failed to fetch");
  }
};

export const getLatLongFromPolyline = async (polyString: any) => {
  const points = polyline.decode(polyString);
  return points;
};

export const getOptimizedRoute = async (
  locations: any,
  currentLocation: any
) => {
  try {
    const locationsWithDistance = [];
    for (const singleLoc of locations) {
      const { DistancekmCheck, DurationMinCheck } =
        await getDistanceTimeBWTwoPoints(singleLoc, currentLocation);
      locationsWithDistance.push({
        ...singleLoc,
        DistancekmCheck,
        DurationMinCheck,
      });
    }
    locationsWithDistance.sort((a, b) => a.DistancekmCheck - b.DistancekmCheck);
    return locationsWithDistance;
  } catch (e) {
    return locations;
  }
};

export const getDistanceTimeBWTwoPoints = async (
  firstLoc: any,
  secondLoc: any
) => {
  let DistancekmCheck = 5;
  let DurationMinCheck = `0 mins`;
  try {
    if (!firstLoc || !secondLoc) {
      return { DistancekmCheck, DurationMinCheck };
    }

    const baseUrl =
      "https://api.mapbox.com/directions/v5/mapbox/driving-traffic";

    const coordinates = [
      `${firstLoc.longitude},${firstLoc.latitude}`,
      `${secondLoc.longitude},${secondLoc.latitude}`,
    ].join(";");

    const url = new URL(`${baseUrl}/${coordinates}`);
    url.searchParams.append("geometries", "polyline");
    url.searchParams.append("steps", "true");
    url.searchParams.append("language", "en");
    url.searchParams.append("overview", "full");
    url.searchParams.append("alternatives", "false");
    url.searchParams.append("exclude", "ferry");
    url.searchParams.append("access_token", process.env.MAP_BOX_TOKEN || "");

    try {
      const response = await fetch(url?.toString());
      const data = await response.json();

      if (data.code === "Ok") {
        const routes = data.routes.map((route: any) => ({
          legs: route.legs.map((leg: any) => ({
            steps: leg.steps.map((step: any) => ({
              ...step,
              maneuver: step.maneuver?.modifier || step.maneuver?.type,
              distance: {
                value: step.distance,
              },
              duration: {
                value: step.duration,
              },
            })),
            distance: {
              value: leg.distance,
            },
            duration: {
              value: leg.duration,
            },
          })),
          overview_polyline: {
            points: route.geometry,
          },
        }));

        for (let legs of routes[0].legs) {
          for (let step of legs.steps) {
            if (step.maneuver === "ferry") {
              return { DistancekmCheck, DurationMinCheck };
            }
          }
        }
        DistancekmCheck = routes[0].legs[0].distance.value / 1000;
        DurationMinCheck = `${Math.round(
          routes[0].legs[0].duration.value / 60
        )} mins`;
        return { DistancekmCheck, DurationMinCheck };
      } else {
        return { DistancekmCheck, DurationMinCheck };
      }
    } catch (e) {
      return { DistancekmCheck, DurationMinCheck };
    }
  } catch (e) {
    return { DistancekmCheck, DurationMinCheck };
  }
};

export const orderUpdatePolyline = async (
  request: any,
  body: any,
  response: any
) => {
  try {
    if (body.status === "pickupPolyline") {
      await rideBookingsModel.updateOne(
        { _id: body?.bookingId },
        {
          "polylineMapping.pickupPolyline": `${response}`,
        }
      );
    } else if (body.status === "droppingPolyline") {
      await rideBookingsModel.updateOne(
        { _id: body?.bookingId },
        {
          "polylineMapping.droppingPolyline": `${response}`,
        }
      );
    } else if (body.status === "existingJobPolyline") {
      await rideBookingsModel.updateOne(
        { _id: body?.bookingId },
        {
          "polylineMapping.existingJobPolyline": `${response}`,
        }
      );
    }
    return true;
  } catch (e: any) {
    logger.error({ error: e, msg: e.message });
    return false;
  }
};
