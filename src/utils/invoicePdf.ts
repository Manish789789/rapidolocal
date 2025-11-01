import { HSTNO } from "./constant";
import pdf from "html-pdf";

export const invoicePdfFile = (pdfData: any, isCancellationCharges = false) => {
  let contentArray = [
    {
      description: `Rides Fare ${pdfData?.surge ? `(Included surge charge $${pdfData?.surge})` : ""
        }`,
      amount: `CA$ ${pdfData?.totalFare}`,
    },
    { description: "HST", amount: `CA$ ${pdfData?.tax}` },
    { description: "Discount", amount: `-CA$ ${pdfData?.discount}` },
    {
      description: "Waiting Charges",
      amount: `CA$ ${pdfData?.waitingCharges}`,
    },
  ];

  if (isCancellationCharges) {
    contentArray = [
      {
        description: `Cancellation Fee`,
        amount: `CA$ ${pdfData?.CancellationFee}`,
      },
      { description: "HST", amount: `CA$ ${pdfData?.tax}` },
    ];
  }

  if (pdfData?.withTip) {
    contentArray.splice(3, 0, {
      description: "Tip",
      amount: `CA$ ${pdfData?.tip}`,
    });
  }

  const totalAmount = pdfData?.withTip
    ? pdfData?.totalWithTip
    : pdfData?.totalWithOutTip;
  const driverFirstName = pdfData?.driverName
    ? pdfData.driverName.split(" ")[0]
    : "N/A";

  const data = {
    taxInfo:
      "This Ride Invoice serves as an official record of your trip details, including fare breakdowns and applicable charges.",
    pickUp: pdfData?.pickUp?.address || "N/A",
    dropOff: pdfData?.dropOff?.address || "N/A",
    orderNo: pdfData?.orderNo || "N/A",
    // driverName: pdfData?.driverName || "N/A",
    driverName: driverFirstName,
    vehicleDetails: pdfData?.vehicleDetails || "N/A",
    rideDurationKm: pdfData?.rideDurationKm || "N/A",
    rideDuration: pdfData?.rideDuration || "N/A",
    createdAt: pdfData?.createdAt || "N/A",
    pickedAt: pdfData?.pickedAt || "N/A",
    dropedAt: pdfData?.dropedAt || "N/A",
    HstNo: HSTNO,
    sections: [
      {
        heading: "Rapido Ride - Gross Fares Breakdown",
        description: "This section outlines the fares and fees applied.",
        content: contentArray,
        footer: [{ description: "Total", amount: `CA$ ${totalAmount}` }],
      },
    ],
  };

  return `
  <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ride Invoice</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.3;
            background-color: white;
          }
          header {
            text-align: center;
          }
          header h1 {
            color: #2c3e50;
            margin-bottom: 10px;
          }
          header p {
            color: #34495e;
            font-size: 14px;
          }
          h3 {
            color: #5D25FF;
            text-transform: uppercase;
          }
          .financial-year {
            color: #0f003c;
            font-size: 18px;
          }
          .driver-name {
            color: #5e5e5e;
            font-weight: bold;
            font-size: 18px;
          }
          .tax-info {
            color: #7a7a7a;
            font-size: 15px;
            font-weight: normal;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          table th, table td {
            padding: 8px;
            text-align: left;
          }
          table th {
            background-color: #f4f4f4;
          }
          tfoot th {
            text-align: left; 
          }
          .summary {
            margin-top: 20px;
            text-align: right;
          }
          .summary p {
            font-size: 16px;
            font-weight: bold;
          }
          .lastEnd {
            text-align: center;
            color: #5e5e5e
          }
          .extra-info-table {
          width: 100%;
         }
          .extra-info-table td {
              padding: 8px;
              text-align: left;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>Rapido Ride</h1>
          <p class="tax-info">${data?.taxInfo}</p>
        </header>
        <div class="extra-info">
          <p><strong>Order Number:</strong> ${data.orderNo}</p>
          <p><strong>HST Number:</strong> ${data.HstNo}</p>
          <p><strong>Driver:</strong> ${data.driverName}</p>
          <p><strong>Vehicle Details:</strong> ${data.vehicleDetails}</p>
          <p><strong>Pick-up Address:</strong> ${data.pickUp
    } <strong>at</strong> ${new Date(data.pickedAt).toLocaleTimeString(
      "en-CA",
      { timeZone: "America/St_Johns" }
    )}</p>
          <p><strong>Drop-off Address:</strong> ${data.dropOff
    } <strong>at</strong> ${new Date(data.dropedAt).toLocaleTimeString(
      "en-CA",
      { timeZone: "America/St_Johns" }
    )}</p>
          <p><strong>Trip Distance:</strong> ${data.rideDurationKm}</p>
          <p><strong>Trip Duration:</strong> ${data.rideDuration}</p>
        </div>
      
         <div>
           ${data?.sections
      ?.map(
        (section) => `
      <section>
        <h3>${section?.heading}</h3>
        ${section?.description ? `<p>${section?.description}</p>` : ""}
        <table>
          <tbody>
            ${section?.content
            ?.map(
              (item) => `
              <tr>
                <td>${item?.description}</td>
                <td>${item?.amount}</td>
              </tr>
            `
            )
            ?.join("")}

             ${section?.footer
            ?.map(
              (footerItem) => `
          <tr>
            <th>${footerItem?.description}</th>
            <th>${footerItem?.amount}</th>
          </tr>
        `
            )
            ?.join("")}
        </tbody>
      </table>

    </section>
  `
      )
      .join("")}
      </div>
    </body>
    </html>
    `;
};

export const generateUniqueInvoiceName = (
  name: string,
  orderNo: string
): string => {
  return `${name}_${orderNo}_Invoice.pdf`;
};

export const generateUniquePdfFileName = (
  name: any,
  pdfMonth: any,
  pdfYear: any
) => {
  const timestamp = Date.now();
  return pdfMonth
    ? `${name}_${pdfMonth}_${pdfYear}_${timestamp}.pdf`
    : `${name}_${pdfYear}_${timestamp}.pdf`;
};

export const generatePdfFile = (
  htmlContent: any,
  pdfFilePath: any,
  options: any
) => {
  return new Promise((resolve, reject) => {
    pdf.create(htmlContent, options).toFile(pdfFilePath, function (err, res) {
      if (err) return reject(err);
      resolve(res);
    });
  });
};

export const taxPdfFile = (request: any, body: any, pdfData: any) => {
  const data = {
    financialYear: "2023-2024",
    driverName: "John Doe",
    taxInfo:
      "Many of the items listed below may be tax deductible. For more information, we recommend that you seek guidance from a qualified tax site or service.",
    sections: [
      {
        heading: "Rapido Ride - Gross Fares Breakdown",
        description:
          "This section indicates the fees you have charged to Riders.",
        content: [
          {
            description: "Gross RapidoRide rides fare",
            amount: `CA$ ${pdfData?.totalFare}`,
          },
          { description: "Service Fee", amount: `CA$ ${pdfData?.serviceFee}` },
          { description: "Booking Fee", amount: `CA$ ${pdfData?.bookingFee}` },
          // { description: "Regulatory Recovery Fees", amount: `CA$ ${pdfData?.regulatoryRecoveryFee}` },
          // { description: "Airport fee", amount: `CA$ ${pdfData?.airportFee}` },
          // { description: "Split Fare", amount: `CA$ ${pdfData?.splitFee}` },
          {
            description: "Miscellaneous",
            amount: `CA$ ${pdfData?.miscellaneous}`,
          },
          { description: "Discount", amount: `-CA$ ${pdfData?.userDiscount}` },
          // { description: "Tolls", amount: `CA$ ${pdfData?.tolls}` },
          { description: "Tips", amount: `CA$ ${pdfData?.tips}` },
          {
            description: "GST/HST you collected from Riders",
            amount: `CA$ ${pdfData?.collectedHst}`,
          },
          { description: "Your GST/HST Number", amount: `${pdfData?.hstGst}` },
        ],
        footer: [{ description: "Total", amount: `CA$ ${pdfData?.total}` }],

        // extraInfo: {
        //   gst: "GST/HST you collected from RapidoRide",
        //   number: "798-849-865-rt0001",
        // },
      },
      // {
      //   heading: "Rapido Ride - Fees Breakdown",
      //   description:
      //     "This section indicates the fees you have paid to RapidoRide. These include the service fees, as well as pass-through fees such as booking fee, regulatory fee, or airport fees.",
      //   content: [
      //     { description: "Service Fee", amount: "CA$10,456.70" },
      //     { description: "Other amounts", amount: "CA$9,722.44" },
      //     { description: "Fee Discount", amount: "-CA$1,219.13" },
      //     {
      //       description: "GST/HST you paid to RapidoRide",
      //       amount: "CA$2,189.81",
      //     },
      //   ],
      //   footer: [
      //     { description: "Total", amount: "CA$21,149.82" },
      //     //   { description: "Your GST/HST Number", amount: "798849865 RT0001" },
      //   ],
      //   // extraInfo: "Your GST/HST Number: 798849865 RT0001",
      //   extraInfo: {
      //     gst: "GST/HST you collected from RapidoRide",
      //     number: "798849865 RT0001",
      //   },
      // },
      // {
      //   heading: "Rapido Ride Eats - Gross Fares Breakdown",
      //   description:
      //     "Tolls and tips not subjected to GST/HST. You have collected GST/HST from RapidoRide on your RapidoRide Eats Fares if you are registered for GST/HST and have entered all the relevant information in your tax profile.",
      //   content: [
      //     { description: "Rapido Ride Eats Fares", amount: "CA$1,330.82" },
      //     { description: "Tips", amount: "CA$596.23" },
      //     { description: "Tolls", amount: "-CA$4.12" },
      //     {
      //       description: "GST/HST you collected from RapidoRide",
      //       amount: "CA$173.02",
      //     },
      //   ],
      //   footer: [{ description: "Total", amount: "CA$2,104.19" }],
      // },
      {
        // heading: "Other Income Breakdown",
        heading: "Rapido Ride - Fees Breakdown",
        description:
          "This section indicates the fees you have paid to RapidoRide. These include the service fees, as well as pass-through fees such as booking fee.",
        content: [
          { description: "Service Fee", amount: `CA$ ${pdfData?.serviceFee}` },
          {
            description: "Other amounts(Booking)",
            amount: `CA$ ${pdfData?.bookingFee}`,
          },
          { description: "Fee Discount", amount: `-CA$ ${pdfData?.discount}` },
          {
            description: "GST/HST you paid to RapidoRide",
            amount: `CA$ ${pdfData?.paidHst}`,
          },
        ],
        footer: [
          {
            description: "Total",
            amount: `CA$ ${pdfData?.feesBreakdownTotal}`,
          },
        ],
      },
      {
        heading: "Other Potential Deductions",
        content: [
          {
            description: "On Trip Mileage",
            amount: `${pdfData?.tripMileage} km`,
          },
          {
            description: "Online Mileage",
            amount: `${pdfData?.onlineMileage} km`,
          },
        ],
        footer: pdfData?.total ? [] : [],
      },
    ],
    grossFare:
      "Gross fare are calculated as base+time+distance(this includes the RapidiRide Service Fee)",
    infoSummary:
      "The information in this summary does not reflect your personal tax situation and is informative only.Nothing in this summary constitutes tax advice nor an employment relationship between RapidiRide and you,neither express nor implied.Please consult your local tax advisor or tax administration for your personal tax obligations.",
  };

  return `
<html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tax Summary</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.3;
        }
        header {
          text-align: center;
        }
        header h1 {
          color: #2c3e50;
          margin-bottom: 10px;
        }
        header p {
          color: #34495e;
          font-size: 14px;
        }
        h3 {
          color: #5d25ff;
          text-transform: uppercase;
        }
        .financial-year {
          color: #0f003c;
          font-size: 18px;
        }
        .driver-name {
          color: #5e5e5e;
          font-weight: bold;
          font-size: 18px;
        }
        .tax-info {
          color: #7a7a7a;
          font-size: 15px;
          font-weight: normal;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        table th, table td {
          padding: 8px;
          text-align: left;
        }
        table th {
          background-color: #f4f4f4;
        }
        tfoot th {
          text-align: left; 
        }
        .summary {
          margin-top: 20px;
          text-align: right;
        }
        .summary p {
          font-size: 16px;
          font-weight: bold;
        }
        .lastEnd {
          text-align: center;
          color: #5e5e5e
        }
        .extra-info-table {
        width: 100%;
       }
        .extra-info-table td {
            padding: 8px;
            text-align: left;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Rapido Ride</h1>
        <p class="financial-year">For the Financial Year: ${body?.month ? body.month + " " : ""
    }${body.year}</p>
        <p class="driver-name">${request.user.fullName}</p>
        <p class="tax-info">${data?.taxInfo}</p>
      </header>
    
       <div>
         ${data?.sections
      ?.map(
        (section) => `
    <section>
      <h3>${section?.heading}</h3>
      ${section?.description ? `<p>${section?.description}</p>` : ""}
      <table>
        <tbody>
          ${section?.content
            ?.map(
              (item) => `
            <tr>
              <td>${item?.description}</td>
              <td>${item?.amount}</td>
            </tr>
          `
            )
            ?.join("")}

             ${section?.footer
            ?.map(
              (footerItem) => `
          <tr>
            <th>${footerItem?.description}</th>
            <th>${footerItem?.amount}</th>
          </tr>
        `
            )
            ?.join("")}
        </tbody>
      </table>

    </section>
  `
      )
      .join("")}
        <p>${data?.grossFare}</p>
        <p class="lastEnd">${data?.infoSummary}</p>
      </div>
    </body>
    </html>
    `;
};

export const rideBookingsPdfFile = (
  rides: any[],
  dateRange: { from: string; to: string },
  zoneName: string
) => {
  const formatDate = (date: string) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString("en-CA", {
      timeZone: "America/St_Johns",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) =>
    `CA$ ${amount?.toFixed(2) || "0.00"}`;

  const totalRevenue = rides.reduce(
    (sum, ride) => sum + (ride.grandTotal || 0),
    0
  );

  const data = {
    reportInfo: `This report contains all completed and paid ride bookings for ${zoneName} zone from ${formatDate(
      dateRange.from
    )} to ${formatDate(dateRange.to)}.`,
    zoneName: zoneName,
    dateFrom: formatDate(dateRange.from),
    dateTo: formatDate(dateRange.to),
    generatedAt: formatDate(new Date().toISOString()),
    HstNo: HSTNO,
    totalRides: rides.length,
    totalRevenue: formatCurrency(totalRevenue),
    rides: rides.map((ride) => ({
      orderNo: ride.orderNo || "N/A",
      customerName: ride.customerDetails?.name || "N/A",
      customerPhone: ride.customerDetails?.phone || "N/A",
      driverName: ride.driverDetails?.name || "N/A",
      driverPhone: ride.driverDetails?.phone || "N/A",
      vehicleNumber: ride.driverDetails?.vehicleNumber || "N/A",
      pickupAddress: ride.tripAddress?.[0]?.address || "N/A",
      dropoffAddress:
        ride.tripAddress?.[ride.tripAddress.length - 1]?.address || "N/A",
      pickedAt: ride.pickedAt ? formatDate(ride.pickedAt) : "N/A",
      dropedAt: ride.dropedAt ? formatDate(ride.dropedAt) : "N/A",
      amount: formatCurrency(ride.grandTotal),
      status: ride.tripStatus || "N/A",
    })),
  };

  return `
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ride Bookings Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.3;
          background-color: white;
        }
        header {
          text-align: center;
        }
        header h1 {
          color: #2c3e50;
          margin-bottom: 10px;
        }
        header p {
          color: #34495e;
          font-size: 14px;
        }
        h3 {
          color: #5D25FF;
          text-transform: uppercase;
        }
        .report-info {
          color: #7a7a7a;
          font-size: 15px;
          font-weight: normal;
          text-align: center;
          margin: 20px 0;
        }
        .extra-info {
          margin: 20px 0;
        }
        .extra-info p {
          margin: 5px 0;
          color: #34495e;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        table th, table td {
          padding: 8px;
          text-align: left;
          border: 1px solid #ddd;
        }
        table th {
          background-color: #f4f4f4;
          font-weight: bold;
        }
        table tbody tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        tfoot th {
          text-align: left;
          background-color: #f4f4f4;
        }
        .text-right {
          text-align: right;
        }
        .summary-section {
          margin-top: 30px;
          padding: 15px;
          background-color: #f8f9fa;
          border-left: 4px solid #5D25FF;
        }
        .summary-section h3 {
          margin-top: 0;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Rapido Ride</h1>
        <p class="report-info">${data.reportInfo}</p>
      </header>

      <div class="extra-info">
        <p><strong>Zone:</strong> ${data.zoneName}</p>
        <p><strong>Report Period:</strong> ${data.dateFrom} to ${data.dateTo
    }</p>
        <p><strong>Generated On:</strong> ${data.generatedAt}</p>
        <p><strong>HST Number:</strong> ${data.HstNo}</p>
      </div>

      <div class="summary-section">
        <h3>Summary</h3>
        <p><strong>Total Rides:</strong> ${data.totalRides}</p>
        <p><strong>Total Revenue:</strong> ${data.totalRevenue}</p>
      </div>

      <section>
        <h3>Ride Bookings Details</h3>
        <table>
          <thead>
            <tr>
              <th>Order No</th>
              <th>Customer Name</th>
              <th>Customer Phone</th>
              <th>Driver Name</th>
              <th>Driver Phone</th>
              <th>Vehicle No</th>
              <th>Pickup Location</th>
              <th>Dropoff Location</th>
              <th>Pickup Time</th>
              <th>Dropoff Time</th>
              <th class="text-right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.rides
      .map(
        (ride) => `
              <tr>
                <td>${ride.orderNo}</td>
                <td>${ride.customerName}</td>
                <td>${ride.customerPhone}</td>
                <td>${ride.driverName}</td>
                <td>${ride.driverPhone}</td>
                <td>${ride.vehicleNumber}</td>
                <td>${ride.pickupAddress}</td>
                <td>${ride.dropoffAddress}</td>
                <td>${ride.pickedAt}</td>
                <td>${ride.dropedAt}</td>
                <td class="text-right">${ride.amount}</td>
                <td>${ride.status}</td>
              </tr>
            `
      )
      .join("")}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="10" class="text-right">Total Revenue:</th>
              <th class="text-right">${data.totalRevenue}</th>
              <th></th>
            </tr>
          </tfoot>
        </table>
      </section>
    </body>
  </html>
  `;
};
