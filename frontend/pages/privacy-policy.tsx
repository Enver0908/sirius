import LegalPageLayout from '../components/LegalPageLayout';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="This policy explains what Sirius stores, how Shopify merchant data is processed, and how merchants can request deletion through Shopify's mandatory privacy workflows."
    >
      <section className="space-y-6">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">1. Scope</h2>
          <p>
            Sirius is an embedded Shopify app that helps merchants analyze store
            performance, detect anomalies, and receive AI-assisted operational guidance.
            This policy applies to merchant data processed through the app.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">2. Data We Receive</h2>
          <p>
            Sirius receives Shopify data that is required for the app&apos;s core analytics
            features. This currently includes read-only access to orders, products, and
            inventory data. The app doesn&apos;t request write scopes.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">3. Data We Store</h2>
          <p>
            We store encrypted Shopify access tokens, encrypted AI provider API keys,
            plan and billing metadata, conversation history generated inside the app,
            token usage logs, task records, and time-limited normalized analytics cache
            derived from Shopify data. Store data is cached to make analytics and chat
            responses faster and more reliable.
          </p>
          <p className="mt-3">
            When a merchant chooses to upload a file or image inside Sirius, the file is
            stored only to process that analysis request and to preserve conversation
            context for that merchant. Uploaded files are not used to train AI models,
            are not shared across merchants, and are not collected from storefront
            customers.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">4. AI Provider Processing</h2>
          <p>
            Merchants choose their own AI provider and supply their own API key.
            Relevant store context is sent only to the provider selected by the merchant
            to generate app responses. Sirius doesn&apos;t resell tokens or act as the
            merchant&apos;s billing intermediary for AI usage.
          </p>
          <p className="mt-3">
            Depending on the merchant&apos;s request, that provider may receive aggregate
            store metrics, normalized order and inventory summaries, conversation history
            from the current merchant, and any files or images the merchant explicitly
            uploads for analysis. Sirius does not send unrelated merchant data across
            stores and does not use storefront customer accounts as AI identities.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">5. AI Training and Cross-Merchant Use</h2>
          <p>
            Sirius does not use merchant data, customer data, derived analytics, or
            conversation history to train or develop AI or machine learning models. We
            do not combine one merchant&apos;s Shopify data with another merchant&apos;s data
            to create benchmark products or market intelligence unless the explicit
            written consent required by Shopify&apos;s terms and applicable merchant
            permissions is obtained. Store context is used to provide the app&apos;s
            features back to the merchant who connected that store.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">6. Security Measures</h2>
          <p>
            Sensitive credentials are encrypted at rest using AES-256-GCM. Shopify
            session tokens and webhook payloads are verified before protected actions are
            allowed. Access is limited to the scopes explicitly approved by the merchant.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">7. Retention and Deletion</h2>
          <p>
            Cached analytics data is stored with expiration windows. When Shopify sends
            mandatory privacy webhooks such as customer redaction or shop redaction,
            Sirius removes or expires the relevant data according to the request.
            Uninstalled shops are also deactivated and can be fully removed through the
            Shopify privacy flow.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">8. Merchant Rights</h2>
          <p>
            Merchants can uninstall the app at any time, stop using any connected AI
            provider, rotate their own AI credentials, and contact the app owner for
            support regarding data handling. Shopify privacy webhooks remain the source
            of truth for redaction and deletion workflows.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">9. Contact</h2>
          <p>
            For privacy-related questions, use the support contact that is published in
            the Shopify App Store listing and Partner Dashboard for this app.
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
