import { t } from "elysia";
export const createSetings = t.Object({
  country: t.String({ error: 'Country is required' }),
  status: t.String({ error: 'Status is required' }),
  taxes: t.Array(t.Object({    // Array of tax objects
    state: t.Object({         // State object
      value: t.String({ error: 'Tax state is required' }),    // State value (string)
      label: t.String({ error: 'Tax state is required' })     // State label (string)
    }),
    tax: t.Array(t.Object({   // Array of tax details
      name: t.String({ error: 'Tax name is required' }),      // Tax name (string)
      amount: t.Number({ error: 'Tax amount is required' }),     // Tax amount (number)
      taxType: t.String({
        error: 'Tax type must be either "Flat" or "Percentage".',
        enum: ['Flat', 'Percentage']
      }) // Custom error for taxType
      // Tax type (string)
    }))
  }))
})