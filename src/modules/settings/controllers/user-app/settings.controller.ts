import { logger } from "@/utils/logger";
import settingsModel from "../../models/settings.model";
import CardNavigationsModel from "../../models/cardNavigations.model";

export const getSettings = async ({ body, error }: any) => {
    try {
        let availableSettings = await settingsModel.find({}).lean();
        return {
            success: true,
            message: "Settings Available",
            data: availableSettings
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
            success: false, message: 'Internal server error'
        })
    }
}

export const homeBannerCards = async ({ body, error }: any) => {
    try {
        let availableCards: any = await CardNavigationsModel.find({}).lean();
        if (availableCards.length === 0) {
            availableCards = [
                {
                    id: 1,
                    bgColor: "#dcfce7",
                    textColor: "#15803d",
                    mainHeading: "Share with others and get 35% off!",
                    subHeading: "Subheading for link click here",
                    imageUrl: "",
                    navigateUrl: "ShareOther",
                },
                {
                    id: 2,
                    bgColor: "#fce7f3",
                    textColor: "#be123c",
                    mainHeading: "Pre Book your ride and relax!",
                    subHeading: "Subheading for link click here",
                    imageUrl: "",
                    navigateUrl: "ScheduledScreen",
                },
                {
                    id: 3,
                    bgColor: "#dbeafe",
                    textColor: "#1d4ed8",
                    mainHeading: "Book your ride and relax!",
                    subHeading: "Subheading for link click here",
                    imageUrl: "",
                    navigateUrl: "BookingScreen",
                },
            ];
        }

        return {
            success: true,
            message: `Card Navigation send successfully`,
            data: availableCards
        }
    } catch (e: any) {
        logger.error({ error: e, msg: e.message });
        return error(400, {
            success: false, message: 'Internal server error'
        })
    }
}