import { useAuth } from '../context/AuthContext';

export function useApi() {
  const { token, logout } = useAuth();

  const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }

    return response;
  };

  return { apiFetch };
}
