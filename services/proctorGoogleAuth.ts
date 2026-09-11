import { ApiError, apiRequest, getAuthApiBaseUrl } from '@/services/api';
import * as Linking from 'expo-linking';

type GoogleRedirectResponse = {
  success: boolean;
  message?: string;
  data?: { url?: string };
};

function looksLikeGoogleCallback(url: string): boolean {
  return /proctor-google/i.test(url);
}

export function isProctorGoogleCallback(url: string): boolean {
  if (!looksLikeGoogleCallback(url)) return false;
  const parsed = Linking.parse(url);
  return (
    parsed.hostname === 'proctor-google' ||
    parsed.path === 'proctor-google' ||
    parsed.path === '/proctor-google' ||
    looksLikeGoogleCallback(url)
  );
}

export function parseProctorGoogleCallback(url: string): { token?: string; error?: string } {
  const parsed = Linking.parse(url);
  const token =
    typeof parsed.queryParams?.token === 'string' ? parsed.queryParams.token : undefined;
  const error =
    typeof parsed.queryParams?.error === 'string' ? parsed.queryParams.error : undefined;
  return { token, error };
}

/** Asks the API for the Google authorization URL, then the app opens it in the system browser. */
export async function getProctorGoogleRedirectUrl(): Promise<string> {
  try {
    const json = await apiRequest<GoogleRedirectResponse>('/proctor/google/redirect?format=json', {
      method: 'GET',
      auth: false,
      baseUrl: getAuthApiBaseUrl(),
    });
    const url = json.data?.url?.trim();
    if (url) return url;
    throw new Error(json.message || 'Google sign-in is not available.');
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(
        error.status === 0
          ? 'Connect to the internet to continue with Google.'
          : error.message,
      );
    }
    throw error;
  }
}
