import { getBookingFromRedis, updateBookingInRedis } from "@/utils/redisHelper";
import { logger } from '@/utils/logger';

export const placeDriverBilling = async (body: any, waitingChargesObj: any) => {
    try {
        let booking: any = await getBookingFromRedis(body._id);
        const bookingFee = parseFloat(booking?.selectedVehicle?.bookingFee || "0");
        const opeartingFee = parseFloat(booking?.selectedVehicle?.operatingFee || "0");
        let fare = parseFloat(booking?.selectedVehicle?.subTotal) - bookingFee - opeartingFee + waitingChargesObj.charges
        let reservationPrice = 0

        if (booking?.scheduled?.scheduledAt) {
            fare = fare - (parseFloat(booking?.selectedVehicle?.forReservationPrice?.price))
            reservationPrice = 1.5
        }

        let afterReservation = fare + reservationPrice
        const serviceFee = afterReservation * 0.25;
        const taxOnServiceFee = serviceFee * 0.15;
        const subTotal = afterReservation - serviceFee - taxOnServiceFee;
        const driverTax = afterReservation * 0.15;
        const expenses = subTotal * 0.03;

        let collectOrder: any = {
            driverEarning: {
                forReservationPrice: reservationPrice,
                fare: fare,
                serviceFee,
                otherEarning: 0,
                tax: taxOnServiceFee,
                driverTax,
                tips: 0,
                subTotal: subTotal,
                expenses,
                grandTotal: driverTax + subTotal - expenses,
            },
        };

        await updateBookingInRedis(body._id, {
            "finalBilling.driverEarning.grandTotal": collectOrder?.driverEarning?.grandTotal,
            "finalBilling.driverEarning.forReservationPrice": collectOrder?.driverEarning?.forReservationPrice,
            "finalBilling.driverEarning.fare": collectOrder?.driverEarning?.fare,
            "finalBilling.driverEarning.serviceFee": collectOrder?.driverEarning?.serviceFee,
            "finalBilling.driverEarning.otherEarning": collectOrder?.driverEarning?.otherEarning,
            "finalBilling.driverEarning.tax": collectOrder?.driverEarning?.tax,
            "finalBilling.driverEarning.driverTax": collectOrder?.driverEarning?.driverTax,
            "finalBilling.driverEarning.tips": collectOrder?.driverEarning?.tips,
            "finalBilling.driverEarning.subTotal": collectOrder?.driverEarning?.subTotal,
            "finalBilling.driverEarning.expenses": collectOrder?.driverEarning?.expenses,
        })

        return collectOrder?.driverEarning?.grandTotal;
    } catch (e: any) {
        logger.error({ error: e, msg: e.message })
    }
};