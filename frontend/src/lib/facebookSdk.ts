declare global {
    interface Window {
        FB?: any;
        fbAsyncInit?: () => void;
    }
}

let sdkPromise: Promise<any> | null = null;

export function loadFacebookSdk(appId: string): Promise<any> {
    if (window.FB) {
        return Promise.resolve(window.FB);
    }
    if (sdkPromise) {
        return sdkPromise;
    }
    sdkPromise = new Promise((resolve, reject) => {
        window.fbAsyncInit = () => {
            window.FB.init({ appId, cookie: true, xfbml: false, version: 'v21.0' });
            resolve(window.FB);
        };
        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.onerror = () => {
            sdkPromise = null;
            reject(new Error('Could not load the Facebook SDK'));
        };
        document.head.appendChild(script);
    });
    return sdkPromise;
}

export interface EmbeddedSignupResult {
    code: string;
    phoneNumberId: string;
    wabaId: string;
}

export function launchWhatsAppSignup(appId: string, configId: string): Promise<EmbeddedSignupResult> {
    return loadFacebookSdk(appId).then(
        (FB) =>
            new Promise<EmbeddedSignupResult>((resolve, reject) => {
                let phoneNumberId = '';
                let wabaId = '';

                const onMessage = (event: MessageEvent) => {
                    if (!event.origin.endsWith('facebook.com')) return;
                    try {
                        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
                        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
                            phoneNumberId = data.data?.phone_number_id || '';
                            wabaId = data.data?.waba_id || '';
                        }
                    } catch {
                        return;
                    }
                };
                window.addEventListener('message', onMessage);

                FB.login(
                    (response: any) => {
                        window.removeEventListener('message', onMessage);
                        const code = response?.authResponse?.code || '';
                        if (!code) {
                            reject(new Error('The WhatsApp signup was cancelled.'));
                            return;
                        }
                        resolve({ code, phoneNumberId, wabaId });
                    },
                    {
                        config_id: configId,
                        response_type: 'code',
                        override_default_response_type: true,
                        extras: { sessionInfoVersion: '3' },
                    },
                );
            }),
    );
}
