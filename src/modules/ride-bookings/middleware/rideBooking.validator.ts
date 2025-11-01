import { t } from "elysia";
import { bookingStatus } from "../models/rideBookings.model";

export const updateBookingStatus = t.Object({
    _id: t.String({
        pattern: "^[a-fA-F0-9]{24}$",
        error: "A valid MongoDB ObjectId is required"
    }),
    status: t.String({
        enum: Object.values(bookingStatus),
        error: "Invalid booking status"
    }),
    otp: t.Optional(t.String({
        pattern: "^[0-9]{4}$",
        error: "A valid 4-digit OTP is required"
    })),
    isForce: t.Optional(t.Boolean()),
    // arrivalTime: t.Optional(t.String({
    //     pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$",
    //     error: "A valid ISO 8601 date string is required"
    // }))
});
export const idChecker = t.Object({
    id: t.String({
        pattern: "^[a-fA-F0-9]{24}$",
        error: "Invalid id"
    })
});
export const cancelBookingByUser = t.Object({
    reson: t.String({
        error: "Invalid reason"
    })
});

export const nearByCars = t.Object({
    address: t.Array(
        t.Object({
            location: t.Object({
                longitude: t.Number({ error: "Longitude is required" }),
                latitude: t.Number({ error: "Latitude is required" })
            })
        }),
        { minItems: 1, error: "At least one address is required" }
    )
})
export const placeBooking = t.Object({
    paymentMethodId: t.String({ error: "Payment method is required" }),
    tripAddress: t.Array(
        t.Object({
            markerType: t.Optional(t.String()),
            title: t.String({ error: "Title is required" }),
            address: t.String({ error: "Address is required" }),
            location: t.Object({
                latitude: t.Number({ error: "Latitude is required" }),
                longitude: t.Number({ error: "Longitude is required" })
            })
        }),
        { minItems: 1, error: "At least one trip address is required" }
    ),
    date_time: t.Optional(t.String({ error: "date_time must be a string in ISO format" })),
    rideWhen: t.Optional(t.String({ enum: ["NOW", "LATER"], error: "rideWhen must be NOW or LATER" })),
    notesType: t.Optional(t.Array(
        t.Object({
            noteFor: t.String(),
            details: t.String()
        }), { default: [] }
    )),


    selectedVehicle: t.Object({
        _id: t.String({ pattern: "^[a-fA-F0-9]{24}$", error: "A valid vehicle id is required" }),
        name: t.String({ error: "Vehicle name is required" }),
        icon: t.Optional(t.String()),
        seats: t.Optional(t.Number()),
        status: t.Optional(t.Boolean()),
        surgeCharge: t.Optional(t.Number()),
        surgeValue: t.Optional(t.Number()),
        vehiclePrice: t.Optional(t.Number()),
        subTotal: t.Optional(t.Number()),
        price: t.Number({ error: "Price is required" }),
        operatingFee: t.Optional(t.Number()),
        bookingFee: t.Optional(t.Number()),
        discount: t.Optional(t.Number({ default: 0 })),
        pricingModalId: t.String({ pattern: "^[a-fA-F0-9]{24}$", error: "pricing ID invalid" }),
        pricing: t.Optional(t.Array(
            t.Object({
                name: t.String(),
                price: t.Number()
            })
        )),
        tax: t.Optional(t.Object({
            percentage: t.Optional(t.Number()),
            taxTotal: t.Optional(t.Number())
        })),
        discountObject: t.Optional(t.Object({
            id: t.Optional(t.String({ pattern: "^[a-fA-F0-9]{24}$" })),
            code: t.Optional(t.String()),
            discount: t.Optional(t.Number()),
            discountType: t.Optional(t.String()),
            uptoAmount: t.Optional(t.Number()),
            isApplied: t.Optional(t.Boolean())
        })),
        km: t.Optional(t.Number()),
        kmText: t.Optional(t.String()),
        durationText: t.Optional(t.String()),
        duration: t.Optional(t.Number()),
        isAvailable: t.Optional(t.Boolean())
    }),

    switchRider: t.Optional(t.Object({
        bookRide: t.String({ enum: ["SELF", "OTHER"], error: "bookRide must be SELF or OTHER" }),
        passenger: t.Optional(t.Number({ default: 1 }))
    }))
});
