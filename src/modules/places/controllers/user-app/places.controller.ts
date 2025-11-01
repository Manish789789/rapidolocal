import GeoLatLongPlacesModel from "../../models/GeoLatLongPlaces.model";
import { logger } from "@/utils/logger";
import GeoPlacesModel from "../../models/GeoPlaces.model";
import { getDetailsOfPlacesFromMapBox, getDirections, getPlacesFromMapBox, orderUpdatePolyline } from "@/utils/map/mapboxHelper";
import geoZonesModel from "@/modules/geo-zones/models/geoZones.model";
const GOOGLE_API_KEY = 'AIzaSyDGqtlymNogb3XbdxJoSzQSlwCrzvGZhfc';
const STATIC_KEYWORD = 'nl canada';

export const getAdressWithLatLong = async ({ body, error }: any) => {
    try {
        const { latitude, longitude } = body;
        try {
            let availableResults = await GeoLatLongPlacesModel.aggregate([
                {
                    $geoNear: {
                        near: {
                            type: 'Point',
                            coordinates: [longitude, latitude],
                        },
                        distanceField: 'distance',
                        maxDistance: 3,
                        spherical: true,
                    },
                },
            ])
            try {
                if (availableResults.length === 0) {
                    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${process.env.MAP_BOX_TOKEN}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    const modifiedData = data.features.map((item: any) => {
                        return {
                            place_id: item.id,
                            formatted_address: item.place_name,
                            location: {
                                type: "Point",
                                coordinates: [item.geometry.coordinates[0], item.geometry.coordinates[1]],
                            },
                            geometry: {
                                location: {
                                    lng: item.geometry.coordinates[0],
                                    lat: item.geometry.coordinates[1],
                                }
                            }
                        }
                    })


                    for (const element of modifiedData) {
                        let place = element
                        await GeoLatLongPlacesModel.updateOne(
                            { place_id: place.place_id },
                            {
                                $set: {
                                    place_id: place.place_id,
                                    formatted_address: place.formatted_address,
                                    location: {
                                        type: "Point",
                                        coordinates: [place.geometry.location.lng, place.geometry.location.lat],
                                    },
                                }
                            },
                            { upsert: true }
                        )
                    }

                    return {
                        success: true,
                        message: "Addresses fetched",
                        data: modifiedData
                    }
                } else {
                    return {
                        success: true,
                        message: "Addresses fetched",
                        data: availableResults
                    }
                }
            } catch (e) {
                return error(400, {
                    success: false, message: 'Failed to fetch addressw'
                })
            }
        } catch (e: any) {
            logger.error({ error: e, msg: e.message });
            return error(400, {
                success: false, message: 'Failed to fetch addresse'
            })
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
            success: false, message: 'Internal server error'
        })
    }
}

function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


export const autoComplete = async ({ request, body, query, error }: any) => {
    try {
        if (typeof query?.keyword == 'undefined' || query?.keyword.length == 0) {
            return { success: true, data: [] };
        }
        query.keyword = String(query?.keyword).replace("$", "") || "";
        let ss = ""
        if (query.keyword?.length != "") {
            ss = `${query.keyword} ${STATIC_KEYWORD}`
        }

        // let search_object: any = {}
        // if (query.keyword) {
        //     const words = ss.split(" ").filter(word => word.length > 0);
        //     search_object = {
        //         $and: words.map(rawWord => {
        //             const word = escapeRegex(rawWord);
        //             return {
        //                 $or: [
        //                     { address: { $regex: `\\b${word}\\b`, $options: "i" } },
        //                     { title: { $regex: `\\b${word}\\b`, $options: "i" } },
        //                 ]
        //             };
        //         })
        //     };
        // }

        // search_object["country"] = query?.country || 'ca';

        // const results = await GeoPlacesModel.aggregate([
        //     {
        //         $match: search_object
        //     },
        //     {
        //         $limit: 10
        //     },
        // ])

        // const results = await GeoPlacesModel.find({ "$or": [{ "address": { "$regex": /query.keyword/, "$options": "i" } }, { "title": { "$regex": /input/, "$options": "i" } }] })
        // const regex = new RegExp(query.keyword, "i"); // "i" = case-insensitive

        const results = await GeoPlacesModel.find({
            $or: [
                { address: { $regex: query?.keyword, $options: "i" } },
                { title: { $regex: query?.keyword, $options: "i" } }
            ]
        }).limit(10).lean();

        if (results.length > 0) {
            return { success: true, data: results };
        }

        let address = await getPlacesFromMapBox(query.keyword, process.env.MAP_BOX_TOKEN, query?.country || 'ca');
        if (address.length === 0) {
            address = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${ss}&key=${GOOGLE_API_KEY}&components=country:${query?.country || 'ca'}`).then((res) => res.json()).then((res) => {
                if (res && res.status == 'OK') {
                    const filteredResults = res.predictions?.filter((place: any) =>
                        place.terms.some((term: any) => term.value === 'Newfoundland and Labrador' || term.value === 'NL')
                    );
                    return filteredResults?.map((item: any) => {
                        return {
                            address: item.description,
                            place_id: item.place_id,
                            title: item.structured_formatting?.main_text || '',
                            country: query?.country || 'ca',
                            type: "GOOGLE"
                        }
                    })
                } else {
                    return []
                }
            }).catch((e) => {
                logger.error({ error: e, msg: e.message });
                return []
            });
        }

        const upsertPromises = address.map(async (place: any) =>
            await GeoPlacesModel.updateOne(
                { place_id: place.place_id },
                { $set: place },
                { upsert: true }
            )
        );

        await Promise.all(upsertPromises)
            .then(() => {
            })
            .catch((e) => {
            });
        return { success: true, data: address };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: true, data: [] });
    }
};

export const getLatLongByPlaceId = async ({ request, body, params }: any) => {
    try {
        let isLatLongExist: any = await GeoPlacesModel.findOne({ place_id: params.id, "location.coordinates": { $ne: [] } }).lean()
        if (isLatLongExist) {
            isLatLongExist = {
                ...isLatLongExist,
                geometry: {
                    location: { lat: isLatLongExist.location.coordinates[1], lng: isLatLongExist.location.coordinates[0] },
                },
            }
            return { success: true, data: isLatLongExist };
        }

        let address: any = await getDetailsOfPlacesFromMapBox(params.id, process.env.MAP_BOX_TOKEN);
        if (!address) {
            address = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?placeid=${params.id}&key=${GOOGLE_API_KEY}`).then((res) => res.json()).then((res) => {
                if (res && res.status == 'OK') {
                    return res.result
                } else {
                    return {}
                }
            }).catch((e) => {
                logger.error({ error: e, msg: e.message });
                return {}
            });
        }

        await GeoPlacesModel.updateOne({ place_id: params.id }, { "location.coordinates": [address?.geometry?.location?.lng, address?.geometry?.location?.lat] });
        return { success: true, data: address };
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return {}
    }
};

export const getDirectionOnMap = async ({ request, body, error }: any) => {
    try {
        for (const element of body?.address) {
            let availableZones = await geoZonesModel.findOne({
                location: {
                    $geoIntersects: {
                        $geometry: {
                            type: "Point",
                            coordinates: [element?.location?.longitude, element?.location?.latitude]
                        }
                    }
                }
            }).lean();
            if (availableZones?.geoPoint?.coordinates?.length === 2) {
                element.location.longitude = availableZones?.geoPoint?.coordinates[0];
                element.location.latitude = availableZones?.geoPoint?.coordinates[1];
            }
        }

        const response = await getDirections(body.address, true)
        if (response) {
            await orderUpdatePolyline(request, body, response[0].overview_polyline.points);
            return { success: true, data: response };
        } else {
            return error(400, { success: false, data: [], message: 'Route not available' })
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, { success: false, data: [], message: 'Route not available' })
    }
}