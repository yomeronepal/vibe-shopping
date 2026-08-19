import { LegalShell, LegalSection, LegalList } from './LegalPage';

const CONTACT_EMAIL = 'support@bizally.com';

export default function PrivacyPolicyPage() {
    return (
        <LegalShell title="Privacy Policy" updated="August 19, 2026">
            <LegalSection heading="Who we are">
                <p>
                    BizAlly ("we", "us") is an AI-powered business assistant that helps businesses manage
                    their Facebook Page and Instagram presence: responding to customer messages and comments,
                    publishing content, and processing orders placed through chat. This policy explains what
                    data we collect, how we use it, and the choices you have. It applies to business users who
                    create a BizAlly account ("Vendors") and to people who interact with a Vendor's Facebook
                    Page or Instagram account ("Customers").
                </p>
            </LegalSection>

            <LegalSection heading="Information we collect">
                <p>From Vendors:</p>
                <LegalList items={[
                    'Account details: name, email address, password (stored hashed), phone number, and business information such as store name, address, and logo.',
                    'Social account connections: when you connect a Facebook Page or Instagram account, we receive page identifiers and access tokens from Meta so we can act on your behalf.',
                    'Content you provide: product listings, prices, knowledge documents, website links, and assistant settings.',
                ]} />
                <p>From Customers, via the Meta Platform:</p>
                <LegalList items={[
                    'Messages and comments sent to a connected Facebook Page or Instagram account, including attachments.',
                    'Public profile information Meta shares with the Page, such as name and profile picture.',
                    'Order details a Customer chooses to share in chat, such as name, phone number, delivery address, and email.',
                ]} />
            </LegalSection>

            <LegalSection heading="How we use information">
                <LegalList items={[
                    'To display Customer conversations to the Vendor in a unified inbox and enable replies.',
                    'To generate AI-assisted replies, summaries, and product content on the Vendor’s behalf.',
                    'To create and manage orders, invoices, and delivery details the Customer provides in chat.',
                    'To show Vendors analytics about their own sales, messages, and post engagement.',
                    'To operate, secure, and improve the service.',
                ]} />
                <p>
                    We do not sell personal data. We do not use Customer messages to advertise to Customers,
                    and we do not use data received from Meta for any purpose other than providing the service
                    to the connected Vendor, in line with the Meta Platform Terms and Developer Policies.
                </p>
            </LegalSection>

            <LegalSection heading="AI processing">
                <p>
                    To generate replies and content, relevant conversation text and product information may be
                    processed by third-party AI providers (Google Gemini and Anthropic Claude) under their
                    respective data processing terms. We send only the text needed to produce the response and
                    do not permit these providers to use it to train their models where such controls are available.
                </p>
            </LegalSection>

            <LegalSection heading="Sharing">
                <p>We share data only with:</p>
                <LegalList items={[
                    'Meta Platforms, Inc., to send and receive messages, comments, and posts on the Vendor’s behalf.',
                    'AI providers (Google, Anthropic) as described above.',
                    'Infrastructure providers that host our servers and databases.',
                    'Authorities, where required by law.',
                ]} />
            </LegalSection>

            <LegalSection heading="Storage and retention">
                <p>
                    Data is stored on secured servers and encrypted in transit. Access tokens are stored
                    encrypted. We retain conversation and order data for as long as the Vendor's account is
                    active or as needed to provide the service. When a Vendor disconnects a social account or
                    deletes their BizAlly account, associated platform data is deleted within 30 days, except
                    where retention is required by law (for example, transaction records).
                </p>
            </LegalSection>

            <LegalSection heading="Your rights">
                <LegalList items={[
                    'Access, correct, or delete your personal data.',
                    'Withdraw consent for social account access at any time by disconnecting the account in BizAlly or removing the app in your Facebook or Instagram settings.',
                    'Request a copy of the data we hold about you.',
                ]} />
                <p>
                    Customers may also contact the Vendor they interacted with, who controls the business
                    relationship. To exercise any right with us directly, email{' '}
                    <a className="text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                    See our <a className="text-blue-600 underline" href="/data-deletion">data deletion instructions</a> for
                    step-by-step removal requests.
                </p>
            </LegalSection>

            <LegalSection heading="Children">
                <p>
                    BizAlly is not directed to children under 13 (or the minimum age required in your
                    jurisdiction), and we do not knowingly collect their data.
                </p>
            </LegalSection>

            <LegalSection heading="Changes">
                <p>
                    We may update this policy from time to time. Material changes will be announced to Vendors
                    by email or in the app, and the "Last updated" date above will change.
                </p>
            </LegalSection>

            <LegalSection heading="Contact">
                <p>
                    Questions about this policy or our data practices:{' '}
                    <a className="text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
