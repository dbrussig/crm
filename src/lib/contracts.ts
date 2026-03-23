export interface HealthcheckResponse {
  status: string;
}

export interface BackupStatus {
  provider: string;
  configured: boolean;
}

export interface OAuthConnection {
  provider: string;
  connected: boolean;
  accountEmail?: string;
}
