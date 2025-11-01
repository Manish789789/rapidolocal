import { appLogo, appName, siteUrl, appColor } from "../email.handler"

export default (body: any) => {
  return `<div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
    <div style="margin:50px auto;width:70%;padding:20px 0">
      <div style="border-bottom:1px solid #eee">
        <a href="" style="font-size:1.4em;color: ${appColor};text-decoration:none;font-weight:600">Rapido Ride</a>
      </div>
      <p style="font-size:0.9em;">This is to acknowledge that we have received emergency enabled in this order number ${body?.orderNo}</p>
        <p style="font-size:0.9em;">Customer Name: ${body?.customer?.fullName}</p>
        <p style="font-size:0.9em;">Customer Phone Number: ${body?.customer?.phone}</p>
        <p style="font-size:0.9em;">Driver Name: ${body?.driver?.fullName} </p>
        <p style="font-size:0.9em;">Driver Phone Number: ${body?.driver?.phone} </p>
        <p style="font-size:0.9em;">Trip Details:</p>
        <ul style="font-size:0.9em; padding-left: 20px; margin: 0;">
            ${body?.tripAddress?.map((item: any) => `<li>${item?.address}</li>`).join("")}
        </ul>
        <br>
    </div>
  </div>`
}