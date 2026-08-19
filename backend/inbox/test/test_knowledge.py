from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from core.models import Tenant, VendorProfile
from inbox.services.knowledge import build_knowledge_block, extract_document_text, KnowledgeError


class KnowledgeBlockTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Acme', subdomain='acme',
            metadata={
                'aiKnowledge': 'Delivery Rs. 100.',
                'knowledgeDocs': [{'name': 'pricelist.txt', 'text': 'Shawl Rs. 3500'}],
                'websiteKnowledge': {'url': 'https://acme.com', 'text': 'Since 2015, handmade in Patan.'},
            },
        )

    def test_block_combines_all_sources(self):
        block = build_knowledge_block(self.tenant)
        self.assertIn('Delivery Rs. 100.', block)
        self.assertIn("FROM DOCUMENT 'pricelist.txt'", block)
        self.assertIn('Shawl Rs. 3500', block)
        self.assertIn('FROM THE BUSINESS WEBSITE (https://acme.com)', block)
        self.assertIn('Since 2015', block)

    def test_extract_text_document(self):
        text = extract_document_text('faq.txt', b'Q: COD?\nA: Yes, everywhere.')
        self.assertEqual(text, 'Q: COD? A: Yes, everywhere.')

    def test_extract_rejects_unknown_extension(self):
        with self.assertRaises(KnowledgeError):
            extract_document_text('virus.exe', b'nope')


class KnowledgeApiTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', subdomain='acme')
        self.user = User.objects.create_user(username='owner', password='pass12345')
        VendorProfile.objects.create(user=self.user, tenant=self.tenant, role='owner')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def upload(self, name='notes.txt', body=b'We ship daily at 3pm.'):
        from django.core.files.uploadedfile import SimpleUploadedFile
        return self.client.post(
            '/api/vendor/knowledge/documents/',
            {'file': SimpleUploadedFile(name, body, content_type='text/plain')},
        )

    def test_upload_and_delete_document(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['documents'][0]['name'], 'notes.txt')
        self.tenant.refresh_from_db()
        self.assertIn('ship daily', self.tenant.metadata['knowledgeDocs'][0]['text'])
        response = self.client.delete('/api/vendor/knowledge/documents/?name=notes.txt')
        self.assertEqual(response.data['documents'], [])

    def test_upload_caps_at_three(self):
        for i in range(3):
            self.upload(name=f'doc{i}.txt')
        response = self.upload(name='doc4.txt')
        self.assertEqual(response.status_code, 400)

    def test_upload_rejects_bad_extension(self):
        response = self.upload(name='image.png', body=b'\x89PNG')
        self.assertEqual(response.status_code, 400)

    @patch('inbox.services.knowledge.requests.get')
    def test_website_fetch_and_remove(self, mock_get):
        mock_get.return_value.status_code = 200
        mock_get.return_value.text = '<html><style>x{}</style><body><h1>Acme</h1><p>Handmade shawls since 2015.</p><script>evil()</script></body></html>'
        response = self.client.post('/api/vendor/knowledge/website/', {'url': 'https://acme.com'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.tenant.refresh_from_db()
        text = self.tenant.metadata['websiteKnowledge']['text']
        self.assertIn('Handmade shawls since 2015.', text)
        self.assertNotIn('evil', text)
        response = self.client.delete('/api/vendor/knowledge/website/')
        self.tenant.refresh_from_db()
        self.assertNotIn('websiteKnowledge', self.tenant.metadata)

    def test_website_rejects_bad_url(self):
        response = self.client.post('/api/vendor/knowledge/website/', {'url': 'acme.com'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_restricted_topics_round_trip(self):
        import json
        response = self.client.patch('/api/vendor/profile/', {
            'restricted_topics': json.dumps(['politics', 'competitor prices']),
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['restricted_topics'], ['politics', 'competitor prices'])
