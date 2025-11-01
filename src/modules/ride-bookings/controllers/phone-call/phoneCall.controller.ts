
import twilio from "twilio";
import BookingMap from "../../models/BookingMap";
import { getSettings } from "@/plugins/settings/settings.plugin";

export const normalizeNumber = (num: string) => {
  if (!num) return "";
  let cleaned = num.replace(/\s+/g, "");
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned.replace(/^0+/, "");
  }
  return cleaned;
};

export const callCreationTwillo = async ({ body, set }: { body: any; set: any }) => {
  const settings = getSettings();
  const twilioNumber = settings.callGateway.phoneNumbers[0];

  try {
    let { partyA, partyB } = body;

    if (!partyA || !partyB) {
      set.status = 400;
      return { success: false, message: "Missing partyA or partyB" };
    }


    const bookingId = Bun.randomUUIDv7();

    await BookingMap.findOneAndUpdate(
      { partyA: normalizeNumber(partyA) },
      {
        bookingId,
        partyA: normalizeNumber(partyA),
        partyB: normalizeNumber(partyB),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    set.status = 200;
    return {
      success: true,
      message: "Booking created successfully",
      bookingId,
      twilioNumber,
      expiresIn: "24 hours"
    };
  } catch (error: any) {
    set.status = 500;
    return { success: false, message: "Error creating booking" };
  }
};

export const inboundCallHandler = async ({ body, set }: { body: any; set: any }) => {
  const fromNumber = normalizeNumber(body.From);
  const toNumber = normalizeNumber(body.To);
  const settings = getSettings();
  const twilioNumber = settings.callGateway.phoneNumbers[0];
  const serverUrl = settings.callGateway.endpoint;
  const twiml = new twilio.twiml.VoiceResponse();

  const mapping = await BookingMap.findOne({
    $or: [{ partyA: fromNumber }, { partyB: fromNumber }],
  }).sort({ createdAt: -1 });


  if (!mapping) {
    twiml.say(
      { voice: "Polly.Matthew", language: "en-US" },
      "Hi, this is Rapidoride. Need a ride? Open our app and get going, quick, easy, and local."
    );

    twiml.hangup();
    set.status = 200;
    return new Response(twiml.toString(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // const isPartyA = fromNumber === mapping.partyA;
  // const targetNumber = isPartyA ? mapping.partyB : mapping.partyA;
  const targetNumber = mapping.partyB;
  twiml.say(
    { voice: "Polly.Matthew", language: "en-US" },
    "Please wait while we connect your call."
  );
  const dial = twiml.dial({
    callerId: twilioNumber,
    timeout: 30,
    record: "do-not-record",
    answerOnBridge: true,
  });
  dial.number(
    {
      statusCallbackEvent: [
        "answered",
        "completed",
        "busy",
        "failed",
        "no-answer",
      ] as any,
      statusCallback: `${serverUrl}/api/v1/call-status?bookingId=${mapping.bookingId}`,
      statusCallbackMethod: "POST",
    },
    targetNumber
  );


  set.status = 200;
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
};

export const callStatusHandler = async ({ body, set, query }: { body: any; set: any, query: any }) => {
  const { CallStatus } = body;
  const bookingId = query.bookingId;

  if (!bookingId) {

    set.status = 400;
    return { success: false, message: "Missing bookingId" };
  }

  if (["completed", "failed", "busy", "no-answer"].includes(CallStatus)) {
    await BookingMap.deleteOne({ bookingId });
  }

  set.status = 200;
  return { success: true };
};
