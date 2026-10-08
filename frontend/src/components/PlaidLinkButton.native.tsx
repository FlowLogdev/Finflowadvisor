// The native Bills screen opens the official react-native Plaid SDK directly.
// This placeholder keeps Metro from bundling the browser-only Plaid Link package.
type Props = {
  onSuccess: (publicToken: string, institutionName?: string) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
  color: string;
};

export function PlaidLinkButton(_props: Props) {
  return null;
}
