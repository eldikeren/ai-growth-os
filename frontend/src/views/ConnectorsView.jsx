// ─── AI Growth OS — Connectors View ─────────────────────────────
// Redirects to Credentials — connectors and credentials are the same thing
import CredentialsView from './CredentialsView.jsx';

export default function ConnectorsView({ clientId }) {
  return <CredentialsView clientId={clientId} />;
}
