import { resources } from "@/utils/resources";
import statesModel from "../models/states.model";

export const { index } = resources(statesModel)

export const search = async ({ query, error }: any) => {
    try {

        const { country, search } = query;
        let filter = {};

        if (country) {
            filter = { country };
        }

        if (search) {
            filter = { ...filter, name: { $regex: search, $options: 'i' } };
        }

        const states = await statesModel.find(filter).select('name code country').sort({ name: 1 }).limit(20).lean().then(resources => resources.map((item: any) => ({
            label: item.name,
            value: item._id
        })));

        return {
            success: true,
            data: states,
            message: "States fetched successfully"
        };
    } catch (e: any) {
        return error(500, {
            status: 500,
            message: e.message || "Internal Server Error"

        });
    }
}