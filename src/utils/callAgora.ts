import { RtcTokenBuilder, RtcRole } from 'agora-token';

export const setUpForVoiceCall = (UserId: any, ChannelName: any) => {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;
    const channelName = ChannelName;
    const uid = UserId;
    const tokenExpirationInSecond = 24 * 60 * 60 * 1000;
    const joinChannelPrivilegeExpireInSeconds = 24 * 60 * 60 * 1000;
    const pubAudioPrivilegeExpireInSeconds = 24 * 60 * 60 * 1000;
    const pubVideoPrivilegeExpireInSeconds = 24 * 60 * 60 * 1000;
    const pubDataStreamPrivilegeExpireInSeconds = 24 * 60 * 60 * 1000;
    const role = RtcRole.PUBLISHER;
    const privilegeExpirationInSecond = 24 * 60 * 60 * 1000;
    if (appId == undefined || appId == "" || appCertificate == undefined || appCertificate == "") {
        return null;
    }
    const tokenWithUidAndPrivilege = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role, tokenExpirationInSecond, privilegeExpirationInSecond);
    return tokenWithUidAndPrivilege;
}