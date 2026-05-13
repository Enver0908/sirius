import LegalPageLayout from '../components/LegalPageLayout';

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description="These terms describe how Shopify merchants may use Sirius, how billing works through Shopify, and the responsibilities around merchant-supplied AI credentials."
    >
      <section className="space-y-6">
        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">1. Service Description</h2>
          <p>
            Sirius is a Shopify embedded application that provides sales analytics,
            anomaly detection, AI-assisted recommendations, and operational task support
            using read-only Shopify data and merchant-selected AI providers.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">2. Eligibility</h2>
          <p>
            You must be authorized to act on behalf of the Shopify store that installs
            Sirius. You are responsible for keeping your Shopify account and app access
            secure.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">3. Billing</h2>
          <p>
            App subscription charges are handled through Shopify&apos;s billing system.
            Pricing, trial periods, upgrades, and downgrades are controlled inside the
            app and confirmed through Shopify&apos;s approval flow. AI usage charges are not
            billed by Sirius; merchants pay their selected AI provider directly.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">4. Merchant Responsibilities</h2>
          <p>
            You are responsible for the accuracy of the inputs you provide, including AI
            API keys, plan choices, and operational decisions made after reviewing app
            output. Sirius provides analysis and recommendations, not guaranteed business
            outcomes.
          </p>
          <p className="mt-3">
            If you upload files, images, reports, or archives into Sirius, you confirm
            that you are authorized to submit that content for analysis inside your
            Shopify admin workflow.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">5. Acceptable Use</h2>
          <p>
            You may not use Sirius to violate Shopify policies, misuse data, or attempt
            to bypass Shopify platform controls. The app is intended to operate within
            Shopify&apos;s approved merchant workflows.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">6. Third-Party Services</h2>
          <p>
            Sirius depends on Shopify infrastructure and may send merchant-selected
            context to external AI providers chosen by the merchant. The availability and
            performance of those providers are outside Sirius&apos;s direct control.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">7. AI Data Use</h2>
          <p>
            Sirius uses Shopify store context only to provide app functionality to the
            merchant who connected the store. Merchant data, customer data, derived
            analytics, and app conversations are not used to train or develop AI or
            machine learning models, and are not combined across merchants for market
            intelligence unless the explicit written consent required by Shopify&apos;s
            terms and applicable merchant permissions is obtained.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">8. Suspension and Termination</h2>
          <p>
            We may suspend access if continued use would violate Shopify requirements,
            create security risk, or abuse infrastructure. Merchants may terminate use at
            any time by uninstalling the app from Shopify.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">9. Changes</h2>
          <p>
            We may update the app, pricing, or these terms as the product evolves.
            Material changes should be reflected inside the app experience and Shopify
            listing where relevant.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold text-white">10. Contact</h2>
          <p>
            Support and legal contact details should match the Shopify App Store listing
            and the emergency contact configured in the Shopify Partner Dashboard.
          </p>
        </div>
      </section>
    </LegalPageLayout>
  );
}
