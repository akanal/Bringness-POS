# Shop assistance

Three entry points cover business account setup, seller offer text and purchase guidance. Context links are available on the marketplace, account, registration and seller pages. Guided help works without an external provider and is labelled accordingly.

Free-form AI uses the server-only OpenAI Responses endpoint. Configure SHOP_ASSISTANT_API_KEY and SHOP_ASSISTANT_MODEL (or existing OPENAI_API_KEY / OPENAI_MODEL) in protected server environment, never in browser assets or chat. Both are required. No default model or external calls on page load. SHOP_ASSISTANT_ENABLED=false disables the endpoint. GET /api/v1/shop/assistant/status reports configured availability, not provider health. The existing Netcup deployment and secrets are preserved.

A submit click and explicit consent send only the question and voluntary product facts, category and kind. No account token, company record, order or payment data is read by the assistant. Common email, IBAN and credential patterns are rejected; this is not a comprehensive personal-data filter. No chat history is saved by Bringness; provider request sets store:false. Provider-side policies still apply.

The endpoint permits two concurrent requests, twenty admitted attempts per process/minute and a durable global limit of one hundred provider attempts per UTC day. Failed attempts count; no automatic retries. A daily budget row is the only persisted assistant data. Origin, request size, timeout, response schema and numeric offer facts are checked. These checks cannot establish the truth of generated prose; review is required.

Offer transfers carry only a bounded title and description via session storage for at most one day. The editor requires an explicit apply click and confirmation before replacing nonempty text. Price, tax, stock and account binding stay unchanged. A transfer does not save, publish or buy anything. Public purchases and seller publication remain unavailable.

Verification: isolated mocked-provider/HTTP tests, durable PostgreSQL-compatible budget test, DOM escaping and stale-response test; production-entrypoint acceptance covers the guided status and native browser transfer preserving price and stock. No real AI call or production fixture is used in these tests.
