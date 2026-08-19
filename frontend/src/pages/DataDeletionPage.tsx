import { LegalShell, LegalSection, LegalList } from './LegalPage';

const CONTACT_EMAIL = 'support@bizally.com';

export default function DataDeletionPage() {
    return (
        <LegalShell title="Data Deletion Instructions" updated="August 19, 2026">
            <LegalSection heading="If you are a business using BizAlly">
                <LegalList items={[
                    'Disconnect your Facebook Page or Instagram account from Settings → Connected accounts. This stops all data collection immediately.',
                    `To delete your entire account and its data, email ${CONTACT_EMAIL} from your registered email with the subject "Delete my account".`,
                    'We confirm deletion within 30 days. Conversations, customers, products, orders, and access tokens are permanently removed, except records we must keep by law.',
                ]} />
            </LegalSection>

            <LegalSection heading="If you messaged a business that uses BizAlly">
                <LegalList items={[
                    'You can remove BizAlly’s access via Facebook: Settings & privacy → Settings → Apps and websites, or on Instagram: Settings → Website permissions → Apps and websites.',
                    `To have your conversation history and any details you shared (name, phone, address) deleted, email ${CONTACT_EMAIL} with the name of the business you messaged and the Facebook or Instagram profile you used.`,
                    'You may also ask the business directly; they can delete your conversation and customer record from their BizAlly dashboard.',
                    'Requests are completed within 30 days and confirmed by reply.',
                ]} />
            </LegalSection>

            <LegalSection heading="Contact">
                <p>
                    For any data deletion request or question, email{' '}
                    <a className="text-blue-600 underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </p>
            </LegalSection>
        </LegalShell>
    );
}
