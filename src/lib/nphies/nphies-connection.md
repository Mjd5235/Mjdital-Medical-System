# ============================================================================
# Saudi NPHIES (HL7 FHIR R4) — Mjdital
# ============================================================================

# "SIMULATOR" (development / MVP demos) | "PRODUCTION" (live NPHIES HSB)
NPHIES_MODE="SIMULATOR"

# --- Simulator tuning --------------------------------------------------------
# Artificial network latency per simulated call (ms)
NPHIES_SIMULATOR_LATENCY_MS="250"
# Elapsed time after which a `queued` request resolves to `complete` when polled (ms)
NPHIES_SIMULATOR_QUEUE_DELAY_MS="5000"

# --- Production (only read when NPHIES_MODE="PRODUCTION") ---------------------
# The "/$process-message" operation is appended in code (kept out of .env so that
# dotenv-expand in Next.js does not treat "$process" as a variable).
NPHIES_BASE_URL="https://hsb.nphies.sa/api/fs/fhir"
NPHIES_TIMEOUT_MS="30000"

# mTLS client certificate issued by NPHIES (use file paths OR inline PEM, not both)
NPHIES_CLIENT_CERT_PATH="/secure/nphies/client.crt"
NPHIES_CLIENT_KEY_PATH="/secure/nphies/client.key"
NPHIES_CLIENT_KEY_PASSPHRASE=""
# NPHIES_CLIENT_CERT_PEM="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
# NPHIES_CLIENT_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Optional extra CA bundle to validate the NPHIES server certificate
NPHIES_CA_CERT_PATH=""
# NPHIES_CA_CERT_PEM=""

# Keep "true" in production. Never disable outside local debugging.
NPHIES_TLS_REJECT_UNAUTHORIZED="true"

# Optional license overrides. By default the sender license is the tenant's
# CenterSettings.nphiesFacilityId and the receiver is the payer's nphiesPayerId.
NPHIES_SENDER_LICENSE_ID=""
NPHIES_RECEIVER_LICENSE_ID=""