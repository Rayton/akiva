export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  heloAddress: string;
  auth: boolean;
  username: string;
  password: string;
  passwordConfigured: boolean;
  timeout: number;
  encryption: 'none' | 'tls' | 'ssl';
  fromAddress: string;
  fromName: string;
  updatedAt?: string | null;
}

export interface SmtpOption {
  value: string | number;
  label: string;
}

export interface SmtpPayload {
  settings: SmtpSettings;
  lookups: {
    encryptionOptions: SmtpOption[];
    commonPorts: SmtpOption[];
  };
}

export interface SmtpTestResult {
  status: 'pass' | 'failed';
  host: string;
  port: number;
  elapsedMs: number;
  errorCode?: number;
}
