import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const createStripeCustomAccount = async (driverData: any) => {
  const {
    firstName,
    lastName,
    email,
    dob,
    address,
    bankDetails, // { account_number, transit_number, institution_number }
  } = driverData.body;

  const account = await stripe.accounts.create({
    type: "custom",
    country: "CA",
    email,
    business_type: "individual",
    individual: {
      first_name: firstName,
      last_name: lastName,
      email,
      ...(dob &&
      {
        dob: {
          day: parseInt(dob.split("-")[2]),
          month: parseInt(dob.split("-")[1]),
          year: parseInt(dob.split("-")[0]),
        },

      }
      ),


      address: {
        line1: address?.line1 || "",
        city: address?.city || "",
        postal_code: address?.postalCode || "",
        state: address?.state || "",
        country: "CA",
      },
    },
    capabilities: {
      transfers: { requested: true },
    },
  });

  const externalAccount = await stripe.accounts.createExternalAccount(
    account.id,
    {
      external_account: {
        object: "bank_account",
        country: "CA",
        currency: "CAD",
        account_holder_name: `${firstName} ${lastName}`,
        account_number: bankDetails.accountNumber,
        routing_number: `0${bankDetails.institutionNumber}${bankDetails.transitNumber}`, // Must be 9 digits
      },
    }
  );


  return {
    accountId: account.id,
    bankId: externalAccount.id,
  };
};
