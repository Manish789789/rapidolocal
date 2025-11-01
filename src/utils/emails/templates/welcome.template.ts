import { appLogo, appName, siteUrl, appColor } from "../email.handler"

export default (body: any) => {
  return `<div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
      <div style="margin:50px auto;width:70%;padding:20px 0">
        <div style="border-bottom:1px solid #eee">
          <a href="" style="font-size:1.4em;color: ${appColor};text-decoration:none;font-weight:600">${appName}</a>
        </div>
        <p style="font-size:1.1em">Hello, ${body?.fullName}</p>
        <p>Congratulations! Your individual registration with ${appName} is confirmed!</p>
        <p>If you have any queries or concerns, feel free to contact us at support@${appName}.com.</p>
        <p style="font-size:0.9em;">Thank you,<br>Team ${appName}</p>
        <br>
      </div>
    </div>`
}