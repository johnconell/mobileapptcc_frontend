/**
 * Environment and API configuration (capstone config layer).
 * Values come from Expo public env vars — see .env.example.
 */
export {
  getApiBaseUrl,
  getAuthApiBaseUrl,
  getCloudApiBaseUrl,
  getSyncToken,
  setLanApiUrl,
  clearLanApiUrl,
  hydrateApiBaseUrl,
} from '@/shared/services/api';
