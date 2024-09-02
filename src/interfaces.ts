export interface LiquidOptions {
    RTC_config_username: string;
    RTC_config_credential: string;
  }
  
interface PassKeyCredential {
    device: string;
    publicKey: string;
    credId: string;
    prevCounter: number;
}

interface LiquidAuthUser {
    id: string;
    wallet: string;
    credentials: PassKeyCredential[];
}

interface Cookie {
    originalMaxAge: number | null;
    expires: Date | null;
    secure: boolean;
    httpOnly: boolean;
    path: string;
}

interface LiquidAuthSession {
    cookie: Cookie;
    wallet: string;
}

export interface LiquidAuthAPIJSON {
    user: LiquidAuthUser;
    session: LiquidAuthSession;
}