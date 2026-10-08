import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { usePlaidLink } from 'react-plaid-link';
import { createPlaidLinkToken } from '../api';

type Props = {
  onSuccess: (publicToken: string, institutionName?: string) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
  color: string;
};

const TOKEN_KEY = 'finflow_plaid_link_token';

/** Browser-only Plaid Link launcher. Access tokens remain server-side. */
export function PlaidLinkButton({ onSuccess, onError, disabled, color }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openWhenReady, setOpenWhenReady] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string | undefined>();

  const clearToken = useCallback(() => {
    window.sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setRedirectUri(undefined);
  }, []);

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri: redirectUri,
    onSuccess: async (publicToken, metadata) => {
      setLoading(true);
      try {
        await onSuccess(publicToken, metadata.institution?.name);
      } catch (error: any) {
        onError(error?.message || 'Could not import your bank activity.');
      } finally {
        clearToken();
        setLoading(false);
      }
    },
    onExit: () => {
      clearToken();
      setOpenWhenReady(false);
      setLoading(false);
    },
  });

  useEffect(() => {
    if (openWhenReady && ready && token) {
      setOpenWhenReady(false);
      open();
    }
  }, [open, openWhenReady, ready, token]);

  const launch = async () => {
    if (disabled || loading) return;
    if (token && ready) {
      open();
      return;
    }
    setLoading(true);
    setOpenWhenReady(true);
    try {
      const isOAuthReturn = new URLSearchParams(window.location.search).has('oauth_state_id');
      const saved = window.sessionStorage.getItem(TOKEN_KEY);
      if (isOAuthReturn && saved) {
        setRedirectUri(window.location.href);
        setToken(saved);
        return;
      }
      const { link_token } = await createPlaidLinkToken();
      window.sessionStorage.setItem(TOKEN_KEY, link_token);
      setToken(link_token);
    } catch (error: any) {
      clearToken();
      setOpenWhenReady(false);
      onError(error?.message || 'Could not start bank connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      testID="connect-bank-btn"
      onPress={() => { void launch(); }}
      disabled={disabled || loading || Boolean(token && !ready)}
      style={{ backgroundColor: color, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontFamily: 'DMSans_600SemiBold', fontSize: 13 }}>Connect bank</Text>}
    </TouchableOpacity>
  );
}
