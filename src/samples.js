// Deliberately fictitious values. None of these are working credentials.
export const samples = {
  incident: `2026-05-14T09:41:02Z  ERROR  request failed
service=checkout  status=503  retry=2

Authorization: Bearer demo_access_token_8f2c19
user.email = "alex@example.test"
client_ip = 10.24.8.16
database_url = "postgres://deploy:demo_password@db.internal:5432/shop"

Traceback (most recent call last):
  File "/Users/alex/projects/shop/api.py", line 42
  ConnectionError: pool exhausted after 30000ms

Retry scheduled for alex@example.test
request_id=req_4be9 · region=eu-west-1`,
  env: `# Development config — fictitious demo values
APP_NAME=paperplane
NODE_ENV=development
PORT=3000

API_KEY="demo_key_41f8b2c09a7e"
DATABASE_URL="postgres://app:demo_db_pass@localhost:5432/dev"
CLIENT_SECRET="demo_client_secret_c3d7f9"
SUPPORT_EMAIL=help@example.test
HOME=/home/sam

# Keep the useful context. Review every replacement.`,
  curl: `curl 'https://api.example.test/v1/checkout' \\
  -X POST \\
  -H 'Authorization: Bearer demo_access_token_8f2c19' \\
  -H 'Cookie: session=demo_session_c8f1; tracking=demo_42' \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"alex@example.test","plan":"starter"}'

HTTP/2 422
{"error":"invalid_plan","request_id":"req_4be9"}

# What changed in the plan validation?`
};
