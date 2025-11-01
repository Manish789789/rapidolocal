
export const getNearByCars = async (address: any, redis: any) => {
    let origen = address.shift();
    const originLat = origen.location.latitude ?? origen.latitude ?? origen.lat;
    const originLon = origen.location.longitude ?? origen.longitude ?? origen.lon ?? origen.lng;
    const radiusKm = origen.radiusKm ?? 5; // default radius

    let driverKeys: string[] = [];

    if (originLat != null && originLon != null) {
        try {
            const members: string[] = await redis?.sendCommand([
                'GEOSEARCH',
                'drivers:geo',
                'FROMLONLAT',
                originLon.toString(),
                originLat.toString(),
                'BYRADIUS',
                radiusKm.toString(),
                'km',
                'ASC',
                'COUNT',
                '100'
            ]);
            if (members && members.length) {
                driverKeys = members.map(m => `driver:${m}`);
            }
        } catch (e) {
            if (typeof (redis as any).georadius === 'function') {
                const members = await (redis as any).georadius('drivers:geo', originLon, originLat, radiusKm, 'km', 'ASC', 'COUNT', 100);
                if (members && members.length) driverKeys = members.map((m: any) => `driver:${m}`);
            }
        }
    }
    if (driverKeys.length === 0) {
        driverKeys = (await redis?.keys('driver:*')) || [];
    }
    if (driverKeys.length === 0) {
        return [];
    }
    const driversData = driverKeys.length
        ? (await redis?.json?.mGet(driverKeys, '$')).map((v: any) => v?.[0] ?? null)
        : [];
    return driversData;
}