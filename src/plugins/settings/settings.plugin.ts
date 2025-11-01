import settingsModel from '@/modules/settings/models/settings.model';
import { Elysia } from 'elysia';

interface GatewayValue {
    countries?: string[];
    activeMode?: string;
    // mode-specific nested configs like liveMode, testMode, etc.
    [mode: string]: any;
}

interface SettingsDoc {
    defaultSettings?: Record<string, string>;
    // each gateway key maps to a record of gateway name -> GatewayValue (or plain config)
    [gatewayKey: string]: Record<string, any> | undefined;
}

interface GatewayConfig {
    gateway: string;
    activeMode: string;
    [key: string]: any;
}


const DEFAULT_ACTIVE_MODE = 'liveMode';

function buildConfigFromValue(value: any, gatewayName: string, activeMode?: string): GatewayConfig {
    const mode = activeMode ?? value?.activeMode ?? DEFAULT_ACTIVE_MODE;
    // If value has a nested activeMode object, prefer that; otherwise use value as-is
    const payload = value && value[mode] ? value[mode] : value ?? {};
    return {
        ...(payload as object),
        activeMode: mode,
        gateway: gatewayName
    };
}

function extractGateway(settings: SettingsDoc, gatewayKey: string, countryId?: string): GatewayConfig {
    const table = settings[gatewayKey] as Record<string, GatewayValue> | undefined;

    // pushNotification is treated as a simple mapping (no per-country logic)
    if (gatewayKey === 'pushNotification') {
        const gatewayName = settings.defaultSettings?.[gatewayKey] ?? '';
        return buildConfigFromValue(table?.[gatewayName] ?? {}, gatewayName, DEFAULT_ACTIVE_MODE);
    }

    // try to find a gateway entry that lists the country
    if (countryId && table) {
        for (const [gatewayName, value] of Object.entries(table)) {
            const countries = (value?.countries ?? []).map(String);
            if (countries.includes(countryId)) {
                return buildConfigFromValue(value, gatewayName, value?.activeMode);
            }
        }
    }

    // fallback to default setting
    const defaultGateway = settings.defaultSettings?.[gatewayKey] ?? '';
    return buildConfigFromValue(table?.[defaultGateway] ?? {}, defaultGateway, DEFAULT_ACTIVE_MODE);
}

export const settingsPlugin = new Elysia({ name: 'settings' })
    .derive({ as: 'scoped' }, async (context: any) => {
        const countryId = context.userLocation?.countryId;
        let settings = (await settingsModel.findOne({}).lean()) as Partial<SettingsDoc> | null;

        // if settings not found, return empty defaults
        if (!settings) {
            
            const emptyConfig: GatewayConfig = { gateway: '', activeMode: DEFAULT_ACTIVE_MODE };
            settings = {
                paymentGateway: emptyConfig,
                smsGateway: emptyConfig,
                emailGateway: emptyConfig,
                pushNotification: emptyConfig,
                payoutGateway: emptyConfig,
                callGateway:emptyConfig
            }
            process.env.settings = JSON.stringify(settings);

            return { settings };
        }

        const paymentGateway = extractGateway(settings, 'paymentGateway', countryId);
        const smsGateway = extractGateway(settings, 'smsGateway', countryId);
        const emailGateway = extractGateway(settings, 'emailGateway', countryId);
        const pushNotification = extractGateway(settings, 'pushNotification', countryId);
        const payoutGateway = extractGateway(settings, 'payoutGateway', countryId);
        const callGateway = extractGateway(settings, 'callGateway', countryId);
     
        
        settings = {
            paymentGateway,
            smsGateway,
            emailGateway,
            pushNotification,
            payoutGateway,
            callGateway
        }


        process.env.settings = JSON.stringify(settings);
        return { settings };
    });
export const getSettings = () => {
    const settings = process.env.settings ? JSON.parse(process.env.settings) : null;
    
    return settings;
};