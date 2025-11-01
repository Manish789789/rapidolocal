import { resources } from "@/utils/resources";
import countriesModel from "../models/countries.model";

export const { index, edit } = resources(countriesModel)

export const search = async ({ query, error }: any) => {
    try {

        const { search } = query;
        let filter = {};
        if (search) {
            filter = { ...filter, name: { $regex: search, $options: 'i' } };
        }
        const countries = await countriesModel.find(filter).select('name ').sort({ name: 1 }).lean().then(resources => resources.map((item: any) => ({
            label: item.name,
            value: item._id
        })));

        return {
            success: true,
            data: countries,
            message: "Country fetched successfully"
        };
    } catch (e: any) {
        return error(500, {
            status: 500,
            message: e.message || "Internal Server Error"

        });
    }
}